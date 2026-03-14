import {
  HeartbeatIndexer,
  LlmMemoryExtractor,
  MemoryRepository,
  ReasoningRetriever,
  loadSkillsRuntime,
  type HeartbeatStats,
  type IndexingSettings,
  type MemoryMessage,
  nowIso,
} from "./core/index.js";
import { buildPluginConfig } from "./config.js";
import { normalizeMessages, normalizeTranscriptMessage } from "./message-utils.js";
import type { OpenClawPluginApi, PluginLogger } from "./plugin-api.js";
import { buildPluginTools } from "./tools.js";
import { LocalUiServer } from "./ui-server.js";

const MEMORY_REPAIR_VERSION = "2026-03-13-topic-driven-memory-v13";

function safeLog(logger: PluginLogger | undefined): PluginLogger {
  return logger ?? console;
}

function resolveSessionKey(ctx: Record<string, unknown>): string {
  if (typeof ctx.sessionKey === "string" && ctx.sessionKey.trim()) return ctx.sessionKey;
  if (typeof ctx.sessionId === "string" && ctx.sessionId.trim()) return ctx.sessionId;
  return `session-${Date.now()}`;
}

function shouldSkipCapture(event: Record<string, unknown>, ctx: Record<string, unknown>): boolean {
  if (event.success === false) return true;
  const provider = typeof ctx.messageProvider === "string" ? ctx.messageProvider : "";
  const trigger = typeof ctx.trigger === "string" ? ctx.trigger : "";
  const sessionKey = resolveSessionKey(ctx);
  return ["exec-event", "cron-event"].includes(provider)
    || ["heartbeat", "cron", "memory"].includes(trigger)
    || sessionKey.startsWith("temp:");
}

function sanitizeStoredMessages(messages: MemoryMessage[]): MemoryMessage[] {
  const cleaned: MemoryMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (!message.content.trim()) continue;
    const next = messages[index + 1];
    if (
      message.role === "assistant"
      && next?.role === "assistant"
      && !message.content.includes("\n")
      && !/[你您?？]/.test(message.content)
    ) {
      continue;
    }
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous.role === message.role && previous.content === message.content) continue;
    cleaned.push(message);
  }
  return cleaned;
}

function sanitizeL0Record(
  record: { sessionKey: string; messages: unknown[] },
  config: { includeAssistant: boolean; maxMessageChars: number },
): MemoryMessage[] {
  if (record.sessionKey.startsWith("temp:")) return [];
  return sanitizeStoredMessages(normalizeMessages(record.messages, {
    captureStrategy: "last_turn",
    includeAssistant: config.includeAssistant,
    maxMessageChars: config.maxMessageChars,
  })).filter((message, index, all) => {
    if (message.role === "assistant") {
      return all.slice(0, index).some((item) => item.role === "user");
    }
    return true;
  });
}

function shouldLogStats(stats: HeartbeatStats): boolean {
  return stats.l0Captured > 0
    || stats.l1Created > 0
    || stats.l2TimeUpdated > 0
    || stats.l2ProjectUpdated > 0
    || stats.profileUpdated > 0
    || stats.failed > 0;
}

function logIndexStats(logger: PluginLogger, reason: string, stats: HeartbeatStats): void {
  if (!shouldLogStats(stats)) return;
  logger.info?.(
    `[youarememory] indexed reason=${reason} l0=${stats.l0Captured}, l1=${stats.l1Created}, l2_time=${stats.l2TimeUpdated}, l2_project=${stats.l2ProjectUpdated}, profile=${stats.profileUpdated}, failed=${stats.failed}`,
  );
}

function emptyStats(): HeartbeatStats {
  return {
    l0Captured: 0,
    l1Created: 0,
    l2TimeUpdated: 0,
    l2ProjectUpdated: 0,
    profileUpdated: 0,
    failed: 0,
  };
}

function isGatewayRuntimeProcess(): boolean {
  return process.argv.some((value) => value === "gateway" || value.includes("openclaw-gateway"));
}

const plugin = {
  id: "youarememory-openclaw",
  name: "YouAreMemory OpenClaw Plugin",
  description: "L0/L1/L2 local-first memory plugin for OpenClaw.",
  kind: "memory" as const,

  register(api: OpenClawPluginApi): void {
    const logger = safeLog(api.logger);
    const runtimeHooksAvailable = typeof api.on === "function";
    const liveRuntimeEnabled = runtimeHooksAvailable && isGatewayRuntimeProcess();
    const config = buildPluginConfig(api.pluginConfig);
    const skills = config.skillsDir
      ? loadSkillsRuntime({ skillsDir: config.skillsDir, logger })
      : loadSkillsRuntime({ logger });
    const repository = new MemoryRepository(config.dbPath);
    const persistedSettings = repository.getIndexingSettings(config.defaultIndexingSettings);
    const extractor = new LlmMemoryExtractor(
      api.config ?? {},
      api.runtime as Record<string, unknown> | undefined,
      logger,
    );
    const indexer = new HeartbeatIndexer(
      repository,
      extractor,
      {
        batchSize: config.heartbeatBatchSize,
        source: "openclaw",
        settings: persistedSettings,
        logger,
      },
    );
    const retriever = new ReasoningRetriever(repository, skills, extractor);

    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    const rescheduleHeartbeat = (): void => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      const intervalMinutes = indexer.getSettings().autoIndexIntervalMinutes;
      if (intervalMinutes <= 0) return;
      heartbeatTimer = setInterval(() => {
        void indexNow("scheduled");
      }, intervalMinutes * 60_000);
    };

    const applyIndexingSettings = (partial: Partial<IndexingSettings>): IndexingSettings => {
      const merged = repository.saveIndexingSettings(
        {
          ...indexer.getSettings(),
          ...partial,
        },
        config.defaultIndexingSettings,
      );
      indexer.setSettings(merged);
      rescheduleHeartbeat();
      return merged;
    };

    let indexingPromise: Promise<HeartbeatStats> | undefined;
    const indexNow = async (reason: string, sessionKeys?: string[]): Promise<HeartbeatStats> => {
      if (indexingPromise) {
        logger.info?.(`[youarememory] skip overlapping index run reason=${reason}`);
        return emptyStats();
      }
      const options = sessionKeys && sessionKeys.length > 0 ? { reason, sessionKeys } : { reason };
      indexingPromise = indexer.runHeartbeat(options);
      try {
        const stats = await indexingPromise;
        logIndexStats(logger, reason, stats);
        return stats;
      } finally {
        indexingPromise = undefined;
      }
    };

    const tools = buildPluginTools(repository, retriever);
    api.registerTool?.(() => tools, { names: tools.map((tool) => tool.name) });
    const pendingBySession = new Map<string, MemoryMessage[]>();
    let activeSessionKey: string | undefined;

    let uiServer: LocalUiServer | undefined;
    const stopRuntime = (): void => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      uiServer?.stop();
      repository.close();
    };
    if (config.uiEnabled) {
      uiServer = new LocalUiServer(
        repository,
        retriever,
        {
          host: config.uiHost,
          port: config.uiPort,
          prefix: config.uiPathPrefix,
        },
        {
          getSettings: () => indexer.getSettings(),
          saveSettings: (partial) => applyIndexingSettings(partial),
          runIndexNow: () => indexNow("manual"),
        },
        logger,
      );
    }
    if (api.registerService) {
      api.registerService({
        id: "youarememory-ui-server",
        start: () => uiServer?.start(),
        stop: stopRuntime,
      });
    }
    if (liveRuntimeEnabled) {
      uiServer?.start();
    }

    if (liveRuntimeEnabled) {
      api.on?.(
        "before_prompt_build",
        async (event) => {
          if (!config.recallEnabled) return;
          const prompt = typeof event.prompt === "string" ? event.prompt : "";
          if (prompt.trim().length < 2) return;
          try {
            const startedAt = Date.now();
            const retrieved = await retriever.retrieve(prompt, {
              l2Limit: 4,
              l1Limit: 4,
              l0Limit: 2,
              includeFacts: true,
            });
            const elapsedMs = Date.now() - startedAt;
            if (elapsedMs > 1500) {
              logger.warn?.(`[youarememory] recall slow query_ms=${elapsedMs} prompt_chars=${prompt.length}`);
            }
            if (!retrieved.context) return;
            return { prependSystemContext: retrieved.context };
          } catch (error) {
            logger.warn?.(`[youarememory] recall failed: ${String(error)}`);
            return;
          }
        },
        { priority: 60 },
      );

      api.on?.("before_message_write", (event, ctx) => {
        const sessionKey = typeof ctx.sessionKey === "string" ? ctx.sessionKey.trim() : "";
        if (!sessionKey || sessionKey.startsWith("temp:")) return;
        const normalized = normalizeTranscriptMessage(event.message, {
          includeAssistant: config.includeAssistant,
          maxMessageChars: config.maxMessageChars,
        });
        if (!normalized) return;

        const pending = pendingBySession.get(sessionKey) ?? [];
        const previous = pending[pending.length - 1];
        if (!previous || previous.role !== normalized.role || previous.content !== normalized.content) {
          pending.push(normalized);
          pendingBySession.set(sessionKey, pending);
        }
      });

      api.on?.("agent_end", async (event, ctx) => {
        if (!config.addEnabled) return;
        if (shouldSkipCapture(event, ctx)) return;

        const sessionKey = resolveSessionKey(ctx);
        if (activeSessionKey && activeSessionKey !== sessionKey) {
          void indexNow("session_boundary", [activeSessionKey]);
        }
        activeSessionKey = sessionKey;

        const pending = pendingBySession.get(sessionKey) ?? [];
        pendingBySession.delete(sessionKey);
        let messages = sanitizeStoredMessages(pending);
        if (messages.length === 0) {
          const rawMessages = Array.isArray(event.messages) ? event.messages : [];
          messages = sanitizeL0Record({ sessionKey, messages: rawMessages }, config);
        }
        if (messages.length === 0) return;
        if (!messages.some((message) => message.role === "user")) return;

        const captured = indexer.captureL0Session({
          sessionKey,
          timestamp: typeof event.timestamp === "string" ? event.timestamp : nowIso(),
          messages,
        });
        if (captured) {
          logger.info?.(
            `[youarememory] captured l0 session=${sessionKey} indexed=pending trigger=message_capture|timer|session_boundary|manual`,
          );
          void indexNow("message_capture", [sessionKey]).catch((error) => {
            logger.warn?.(`[youarememory] async message_capture failed: ${String(error)}`);
          });
        }
      });

      rescheduleHeartbeat();
    }

    const startBackgroundRepair = (): void => {
      const repairedVersion = repository.getPipelineState("repairVersion");
      if (repairedVersion === MEMORY_REPAIR_VERSION) return;
      void (async () => {
        try {
          const repair = repository.repairL0Sessions((record) => sanitizeL0Record(record, config));
          repository.resetDerivedIndexes();
          const stats = await indexNow("repair");
          logger.info?.(
            `[youarememory] repaired l0 updated=${repair.updated} removed=${repair.removed}; rebuilt l1=${stats.l1Created}, l2_time=${stats.l2TimeUpdated}, l2_project=${stats.l2ProjectUpdated}, profile=${stats.profileUpdated}, failed=${stats.failed}`,
          );
          repository.setPipelineState("repairVersion", MEMORY_REPAIR_VERSION);
        } catch (error) {
          logger.warn?.(`[youarememory] startup repair failed: ${String(error)}`);
        }
      })();
    };

    if (liveRuntimeEnabled) {
      startBackgroundRepair();
    }
  },
};

export default plugin;
