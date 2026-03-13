import {
  HeartbeatIndexer,
  LlmMemoryExtractor,
  MemoryRepository,
  ReasoningRetriever,
  loadSkillsRuntime,
  type MemoryMessage,
  nowIso,
} from "./core/index.js";
import { buildPluginConfig } from "./config.js";
import { normalizeMessages, normalizeTranscriptMessage } from "./message-utils.js";
import type { OpenClawPluginApi, PluginLogger } from "./plugin-api.js";
import { buildPluginTools } from "./tools.js";
import { LocalUiServer } from "./ui-server.js";

const MEMORY_REPAIR_VERSION = "2026-03-13-llm-index-v10";

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

function sanitizeL0Record(record: { sessionKey: string; messages: unknown[] }, config: { includeAssistant: boolean; maxMessageChars: number }): MemoryMessage[] {
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

const plugin = {
  id: "youarememory-openclaw",
  name: "YouAreMemory OpenClaw Plugin",
  description: "L0/L1/L2 local-first memory plugin for OpenClaw.",
  kind: "memory" as const,

  async register(api: OpenClawPluginApi): Promise<void> {
    const logger = safeLog(api.logger);
    const config = buildPluginConfig(api.pluginConfig);
    const skills = config.skillsDir
      ? loadSkillsRuntime({ skillsDir: config.skillsDir, logger })
      : loadSkillsRuntime({ logger });
    const repository = new MemoryRepository(config.dbPath);
    const extractor = new LlmMemoryExtractor(
      api.config ?? {},
      api.runtime as Record<string, unknown> | undefined,
      logger,
    );
    const indexer = new HeartbeatIndexer(
      repository,
      skills,
      extractor,
      { batchSize: config.heartbeatBatchSize, source: "openclaw", logger },
    );
    const retriever = new ReasoningRetriever(repository, skills);
    const repairedVersion = repository.getPipelineState("repairVersion");
    if (repairedVersion !== MEMORY_REPAIR_VERSION) {
      const repair = repository.repairL0Sessions((record) => sanitizeL0Record(record, config));
      repository.resetDerivedIndexes();
      const stats = await indexer.runHeartbeat();
      logger.info?.(
        `[youarememory] repaired l0 updated=${repair.updated} removed=${repair.removed}; rebuilt l1=${stats.l1Created}, l2_time=${stats.l2TimeUpdated}, l2_project=${stats.l2ProjectUpdated}, failed=${stats.failed}`,
      );
      repository.setPipelineState("repairVersion", MEMORY_REPAIR_VERSION);
    }

    const tools = buildPluginTools(repository, retriever);
    api.registerTool?.(() => tools, { names: tools.map((tool) => tool.name) });
    const pendingBySession = new Map<string, MemoryMessage[]>();

    let uiServer: LocalUiServer | undefined;
    if (config.uiEnabled) {
      uiServer = new LocalUiServer(
        repository,
        retriever,
        {
          host: config.uiHost,
          port: config.uiPort,
          prefix: config.uiPathPrefix,
        },
        logger,
      );
      if (api.registerService) {
        api.registerService({
          id: "youarememory-ui-server",
          start: () => uiServer?.start(),
          stop: () => {
            uiServer?.stop();
            repository.close();
          },
        });
      } else {
        uiServer.start();
      }
    }

    api.on?.(
      "before_prompt_build",
      (event) => {
        if (!config.recallEnabled) return;
        const prompt = typeof event.prompt === "string" ? event.prompt : "";
        if (prompt.trim().length < 2) return;
        try {
          const retrieved = retriever.retrieve(prompt, {
            l2Limit: 6,
            l1Limit: 6,
            l0Limit: 4,
            includeFacts: true,
          });
          if (!retrieved.context) return;
          return { prependContext: retrieved.context };
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
      const pending = pendingBySession.get(sessionKey) ?? [];
      pendingBySession.delete(sessionKey);
      let messages = sanitizeStoredMessages(pending);
      if (messages.length === 0) {
        const rawMessages = Array.isArray(event.messages) ? event.messages : [];
        messages = sanitizeL0Record({ sessionKey, messages: rawMessages }, config);
      }
      if (messages.length === 0) return;
      if (!messages.some((message) => message.role === "user")) return;

      indexer.captureL0Session({
        sessionKey,
        timestamp: typeof event.timestamp === "string" ? event.timestamp : nowIso(),
        messages,
      });
      const stats = await indexer.runHeartbeat();
      logger.info?.(
        `[youarememory] indexed l0=${stats.l0Captured}, l1=${stats.l1Created}, l2_time=${stats.l2TimeUpdated}, l2_project=${stats.l2ProjectUpdated}, failed=${stats.failed}`,
      );
    });
  },
};

export default plugin;
