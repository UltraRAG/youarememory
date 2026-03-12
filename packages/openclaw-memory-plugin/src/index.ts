import {
  HeartbeatIndexer,
  MemoryRepository,
  ReasoningRetriever,
  loadSkillsRuntime,
  nowIso,
} from "./core/index.js";
import { buildPluginConfig } from "./config.js";
import { normalizeMessages } from "./message-utils.js";
import type { OpenClawPluginApi, PluginLogger } from "./plugin-api.js";
import { buildPluginTools } from "./tools.js";
import { LocalUiServer } from "./ui-server.js";

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
  return ["exec-event", "cron-event"].includes(provider);
}

const plugin = {
  id: "youarememory-openclaw",
  name: "YouAreMemory OpenClaw Plugin",
  description: "L0/L1/L2 local-first memory plugin for OpenClaw.",
  kind: "memory" as const,

  register(api: OpenClawPluginApi): void {
    const logger = safeLog(api.logger);
    const config = buildPluginConfig(api.pluginConfig);
    const skills = config.skillsDir
      ? loadSkillsRuntime({ skillsDir: config.skillsDir, logger })
      : loadSkillsRuntime({ logger });
    const repository = new MemoryRepository(config.dbPath);
    const indexer = new HeartbeatIndexer(
      repository,
      skills,
      { batchSize: config.heartbeatBatchSize, source: "openclaw" },
    );
    const retriever = new ReasoningRetriever(repository, skills);

    const tools = buildPluginTools(repository, retriever);
    api.registerTool?.(() => tools, { names: tools.map((tool) => tool.name) });

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

    api.on?.("before_agent_start", (event) => {
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
        logger.warn?.(`[youarememory] legacy recall failed: ${String(error)}`);
        return;
      }
    });

    api.on?.("agent_end", (event, ctx) => {
      if (!config.addEnabled) return;
      if (shouldSkipCapture(event, ctx)) return;

      const rawMessages = Array.isArray(event.messages) ? event.messages : [];
      if (rawMessages.length === 0) return;
      const messages = normalizeMessages(rawMessages, {
        captureStrategy: config.captureStrategy,
        includeAssistant: config.includeAssistant,
        maxMessageChars: config.maxMessageChars,
      });
      if (messages.length === 0) return;

      const sessionKey = resolveSessionKey(ctx);
      indexer.captureL0Session({
        sessionKey,
        timestamp: typeof event.timestamp === "string" ? event.timestamp : nowIso(),
        messages,
      });
      const stats = indexer.runHeartbeat();
      logger.info?.(
        `[youarememory] indexed l0=${stats.l0Captured}, l1=${stats.l1Created}, l2_time=${stats.l2TimeUpdated}, l2_project=${stats.l2ProjectUpdated}`,
      );
    });
  },
};

export default plugin;
