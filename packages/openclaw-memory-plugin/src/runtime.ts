import {
  type DashboardOverview,
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
import type { PluginHookAgentEndEvent, PluginHookAgentContext, PluginHookBeforeMessageWriteEvent, PluginHookBeforePromptBuildEvent, PluginHookBeforePromptBuildResult, PluginHookBeforeResetEvent, PluginLogger, PluginRuntimeLike } from "./plugin-api.js";
import { buildPluginConfig, type PluginRuntimeConfig } from "./config.js";
import { isSessionBoundaryMarkerMessage, normalizeMessages, normalizeTranscriptMessage } from "./message-utils.js";
import { buildPluginTools } from "./tools.js";
import { LocalUiServer } from "./ui-server.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const MEMORY_REPAIR_VERSION = "2026-03-13-topic-driven-memory-v13";
const INDEXING_SETTINGS_MIGRATION_VERSION = "2026-03-16-reasoning-mode-settings-v1";
const PLUGIN_ID = "youarememory-openclaw";

interface MemoryBoundaryDiagnostics {
  slotOwner: string;
  dynamicMemoryRuntime: string;
  workspaceBootstrapPresent: boolean;
  memoryRuntimeHealthy: boolean;
  runtimeIssues: string[];
}

function safeLog(logger: PluginLogger | undefined): PluginLogger {
  return logger ?? console;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function getConfigValue(root: Record<string, unknown> | undefined, path: string[]): unknown {
  let current: unknown = root;
  for (const part of path) {
    const object = asObject(current);
    if (!object) return undefined;
    current = object[part];
  }
  return current;
}

function getConfigString(root: Record<string, unknown> | undefined, path: string[]): string {
  const value = getConfigValue(root, path);
  return typeof value === "string" ? value.trim() : "";
}

function getConfigBoolean(root: Record<string, unknown> | undefined, path: string[]): boolean | undefined {
  const value = getConfigValue(root, path);
  return typeof value === "boolean" ? value : undefined;
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

function mergeStats(left: HeartbeatStats, right: HeartbeatStats): HeartbeatStats {
  return {
    l0Captured: left.l0Captured + right.l0Captured,
    l1Created: left.l1Created + right.l1Created,
    l2TimeUpdated: left.l2TimeUpdated + right.l2TimeUpdated,
    l2ProjectUpdated: left.l2ProjectUpdated + right.l2ProjectUpdated,
    profileUpdated: left.profileUpdated + right.profileUpdated,
    failed: left.failed + right.failed,
  };
}

function buildMemoryRuntimeSystemContext(evidenceBlock: string): string {
  return [
    "## YouAreMemory Runtime",
    "Dynamic conversation memory for this turn is provided by the active YouAreMemory memory-slot plugin.",
    "For questions about prior chats, people, preferences, projects, timelines, or past recommendations:",
    "- Treat YouAreMemory injected evidence as the authoritative dynamic memory source for this turn.",
    "- Do not inspect USER.md, MEMORY.md, or memory/*.md to decide whether memory exists or whether this is a fresh conversation.",
    "- Only inspect workspace files when the user explicitly asks to read, edit, or debug those files.",
    evidenceBlock.trim() ? `\n${evidenceBlock.trim()}` : "",
  ].join("\n").trim();
}

export interface MemoryPluginRuntimeOptions {
  apiConfig: Record<string, unknown> | undefined;
  pluginRuntime: PluginRuntimeLike | undefined;
  pluginConfig: Record<string, unknown> | undefined;
  logger: PluginLogger | undefined;
}

export class MemoryPluginRuntime {
  readonly logger: PluginLogger;
  readonly config: PluginRuntimeConfig;
  readonly repository: MemoryRepository;
  readonly indexer: HeartbeatIndexer;
  readonly retriever: ReasoningRetriever;

  private readonly apiConfig: Record<string, unknown> | undefined;
  private readonly pendingBySession = new Map<string, MemoryMessage[]>();
  private readonly idleIndexTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly debouncedSessions = new Set<string>();
  private readonly queuedSessionKeys = new Set<string>();
  private readonly effectiveSessionKeyByRawSession = new Map<string, string>();
  private readonly conversationGenerationByRawSession = new Map<string, number>();

  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private uiServer: LocalUiServer | undefined;
  private queuePromise: Promise<HeartbeatStats> | undefined;
  private activeSessionKey: string | undefined;
  private queuedFullRun = false;
  private queuedReason = "";
  private indexingInProgress = false;
  private started = false;
  private stopped = false;

  constructor(options: MemoryPluginRuntimeOptions) {
    this.logger = safeLog(options.logger);
    this.apiConfig = options.apiConfig;
    this.config = buildPluginConfig(options.pluginConfig);

    const skills = this.config.skillsDir
      ? loadSkillsRuntime({ skillsDir: this.config.skillsDir, logger: this.logger })
      : loadSkillsRuntime({ logger: this.logger });
    this.repository = new MemoryRepository(this.config.dbPath);
    const persistedSettings = this.repository.getIndexingSettings(this.config.defaultIndexingSettings);
    const migratedSettings = this.maybeUpgradeIndexingSettings(persistedSettings);
    const extractor = new LlmMemoryExtractor(
      options.apiConfig ?? {},
      options.pluginRuntime as Record<string, unknown> | undefined,
      this.logger,
    );
    this.indexer = new HeartbeatIndexer(
      this.repository,
      extractor,
      {
        batchSize: this.config.heartbeatBatchSize,
        source: "openclaw",
        settings: migratedSettings,
        logger: this.logger,
      },
    );
    this.retriever = new ReasoningRetriever(
      this.repository,
      skills,
      extractor,
      {
        getSettings: () => this.indexer.getSettings(),
        isBackgroundBusy: () => this.indexingInProgress,
      },
    );

    if (this.config.uiEnabled) {
      this.uiServer = new LocalUiServer(
        this.repository,
        this.retriever,
        {
          host: this.config.uiHost,
          port: this.config.uiPort,
          prefix: this.config.uiPathPrefix,
        },
        {
          getSettings: () => this.indexer.getSettings(),
          saveSettings: (partial) => this.applyIndexingSettings(partial),
          runIndexNow: () => this.flushAllNow("manual"),
          getRuntimeOverview: () => this.getRuntimeOverview(),
        },
        this.logger,
      );
    }
  }

  private maybeUpgradeIndexingSettings(settings: IndexingSettings): IndexingSettings {
    const migrationState = this.repository.getPipelineState("indexingSettingsMigration");
    if (migrationState === INDEXING_SETTINGS_MIGRATION_VERSION) return settings;
    const normalized = this.repository.saveIndexingSettings(settings, this.config.defaultIndexingSettings);
    this.repository.setPipelineState("indexingSettingsMigration", INDEXING_SETTINGS_MIGRATION_VERSION);
    return normalized;
  }

  getTools() {
    return buildPluginTools(this.repository, this.retriever);
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.rescheduleHeartbeat();
    this.uiServer?.start();
    this.startBackgroundRepair();
    this.logMemoryBoundaryDiagnostics();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.started = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    for (const sessionKey of Array.from(this.idleIndexTimers.keys())) {
      this.clearIdleTimer(sessionKey);
    }
    this.pendingBySession.clear();
    this.effectiveSessionKeyByRawSession.clear();
    this.conversationGenerationByRawSession.clear();
    this.uiServer?.stop();
    this.repository.close();
  }

  private getEffectiveSessionKey(rawSessionKey: string): string {
    const trimmed = rawSessionKey.trim();
    if (!trimmed) return trimmed;
    const cached = this.effectiveSessionKeyByRawSession.get(trimmed);
    if (cached) return cached;
    this.effectiveSessionKeyByRawSession.set(trimmed, trimmed);
    this.conversationGenerationByRawSession.set(trimmed, 0);
    return trimmed;
  }

  private rotateConversationWindow(rawSessionKey: string, reason: string): void {
    const trimmed = rawSessionKey.trim();
    if (!trimmed || trimmed.startsWith("temp:")) return;
    const previousSessionKey = this.getEffectiveSessionKey(trimmed);
    const pending = this.pendingBySession.get(previousSessionKey) ?? [];
    const pendingMessages = sanitizeStoredMessages(pending);
    if (pendingMessages.length > 0 && pendingMessages.some((message) => message.role === "user")) {
      const captured = this.indexer.captureL0Session({
        sessionKey: previousSessionKey,
        timestamp: nowIso(),
        messages: pendingMessages,
      });
      if (captured) {
        this.logger.info?.(`[youarememory] captured pending l0 before ${reason} session=${previousSessionKey}`);
      }
    }
    const nextGeneration = (this.conversationGenerationByRawSession.get(trimmed) ?? 0) + 1;
    const nextSessionKey = `${trimmed}#window:${nextGeneration}`;
    this.conversationGenerationByRawSession.set(trimmed, nextGeneration);
    this.effectiveSessionKeyByRawSession.set(trimmed, nextSessionKey);

    this.pendingBySession.delete(previousSessionKey);
    if (this.activeSessionKey === previousSessionKey) {
      this.activeSessionKey = undefined;
    }

    void this.flushSessionNow(previousSessionKey, reason).catch((error) => {
      this.logger.warn?.(`[youarememory] ${reason} failed session=${previousSessionKey}: ${String(error)}`);
    });
    this.logger.info?.(
      `[youarememory] opened new conversation window raw_session=${trimmed} previous=${previousSessionKey} next=${nextSessionKey} reason=${reason}`,
    );
  }

  handleBeforePromptBuild = async (
    event: PluginHookBeforePromptBuildEvent,
    _ctx: PluginHookAgentContext,
  ): Promise<PluginHookBeforePromptBuildResult | void> => {
    if (!this.config.recallEnabled) return;
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    if (prompt.trim().length < 2) return;
    try {
      const startedAt = Date.now();
      const retrieved = await this.retriever.retrieve(prompt, {
        retrievalMode: "auto",
        l2Limit: 4,
        l1Limit: 2,
        l0Limit: 1,
        includeFacts: true,
      });
      const elapsedMs = Date.now() - startedAt;
      if (
        this.indexer.getSettings().reasoningMode === "answer_first"
        && elapsedMs > this.indexer.getSettings().maxAutoReplyLatencyMs + 300
      ) {
        this.logger.warn?.(`[youarememory] recall slow query_ms=${elapsedMs} prompt_chars=${prompt.length}`);
      }
      const injected = Boolean(retrieved.context?.trim());
      this.logger.info?.(
        `[youarememory] recall mode=${retrieved.debug?.mode ?? "none"} enough_at=${retrieved.enoughAt} injected=${injected} elapsed_ms=${retrieved.debug?.elapsedMs ?? elapsedMs} cache_hit=${retrieved.debug?.cacheHit ? "1" : "0"}`,
      );
      return { appendSystemContext: buildMemoryRuntimeSystemContext(retrieved.context) };
    } catch (error) {
      this.logger.warn?.(`[youarememory] recall failed: ${String(error)}`);
      return { appendSystemContext: buildMemoryRuntimeSystemContext("") };
    }
  };

  handleBeforeMessageWrite = (
    event: PluginHookBeforeMessageWriteEvent,
    ctx: { agentId?: string; sessionKey?: string },
  ): void => {
    const rawSessionKey = typeof ctx.sessionKey === "string" ? ctx.sessionKey.trim() : "";
    if (!rawSessionKey || rawSessionKey.startsWith("temp:")) return;
    if (isSessionBoundaryMarkerMessage(event.message)) {
      this.rotateConversationWindow(rawSessionKey, "session_boundary_marker");
      return;
    }

    const sessionKey = this.getEffectiveSessionKey(rawSessionKey);
    const normalized = normalizeTranscriptMessage(event.message, {
      includeAssistant: this.config.includeAssistant,
      maxMessageChars: this.config.maxMessageChars,
    });
    if (!normalized) return;

    const pending = this.pendingBySession.get(sessionKey) ?? [];
    const previous = pending[pending.length - 1];
    if (!previous || previous.role !== normalized.role || previous.content !== normalized.content) {
      pending.push(normalized);
      this.pendingBySession.set(sessionKey, pending);
    }
  };

  handleAgentEnd = async (event: PluginHookAgentEndEvent, ctx: PluginHookAgentContext): Promise<void> => {
    if (!this.config.addEnabled) return;
    if (shouldSkipCapture(event as unknown as Record<string, unknown>, ctx as Record<string, unknown>)) return;

    const rawSessionKey = resolveSessionKey(ctx as Record<string, unknown>);
    const sessionKey = this.getEffectiveSessionKey(rawSessionKey);
    if (this.activeSessionKey && this.activeSessionKey !== sessionKey) {
      void this.flushSessionNow(this.activeSessionKey, "session_boundary").catch((error) => {
        this.logger.warn?.(`[youarememory] session_boundary failed: ${String(error)}`);
      });
    }
    this.activeSessionKey = sessionKey;

    const pending = this.pendingBySession.get(sessionKey) ?? [];
    this.pendingBySession.delete(sessionKey);
    let messages = sanitizeStoredMessages(pending);
    if (messages.length === 0) {
      const rawMessages = Array.isArray(event.messages) ? event.messages : [];
      messages = sanitizeL0Record({ sessionKey, messages: rawMessages }, this.config);
    }
    if (messages.length === 0) return;
    if (!messages.some((message) => message.role === "user")) return;

    const captured = this.indexer.captureL0Session({
      sessionKey,
      timestamp: typeof event.timestamp === "string" ? event.timestamp : nowIso(),
      messages,
    });
    if (captured) {
      this.logger.info?.(
        `[youarememory] captured l0 session=${sessionKey} indexed=pending trigger=idle|timer|session_boundary|manual`,
      );
      this.scheduleIdleIndex(sessionKey);
    }
  };

  handleBeforeReset = async (event: PluginHookBeforeResetEvent, ctx: PluginHookAgentContext): Promise<void> => {
    if (!this.config.addEnabled) return;
    const fallbackRawSession = typeof ctx.sessionKey === "string" && ctx.sessionKey.trim()
      ? this.getEffectiveSessionKey(ctx.sessionKey)
      : this.activeSessionKey;
    const sessionKey = fallbackRawSession?.trim() ?? "";
    if (!sessionKey || sessionKey.startsWith("temp:")) return;

    try {
      const pending = this.pendingBySession.get(sessionKey) ?? [];
      this.pendingBySession.delete(sessionKey);
      let messages = sanitizeStoredMessages(pending);
      if (messages.length === 0 && Array.isArray(event.messages)) {
        messages = sanitizeL0Record({ sessionKey, messages: event.messages }, this.config);
      }
      if (messages.length > 0 && messages.some((message) => message.role === "user")) {
        const captured = this.indexer.captureL0Session({
          sessionKey,
          timestamp: nowIso(),
          messages,
        });
        if (captured) {
          this.logger.info?.(`[youarememory] captured pending l0 before reset session=${sessionKey}`);
        }
      }
      await this.flushSessionNow(sessionKey, "before_reset");
      if (this.activeSessionKey === sessionKey) {
        this.activeSessionKey = undefined;
      }
    } catch (error) {
      this.logger.warn?.(`[youarememory] before_reset flush failed session=${sessionKey}: ${String(error)}`);
    }
  };

  private getRuntimeOverview(): Pick<
    DashboardOverview,
    | "queuedSessions"
    | "lastRecallMs"
    | "recallTimeouts"
    | "lastRecallMode"
    | "currentReasoningMode"
    | "lastRecallPath"
    | "lastRecallBudgetLimited"
    | "lastShadowDeepQueued"
    | "lastRecallInjected"
    | "lastRecallEnoughAt"
    | "lastRecallCacheHit"
    | "slotOwner"
    | "dynamicMemoryRuntime"
    | "workspaceBootstrapPresent"
    | "memoryRuntimeHealthy"
    | "runtimeIssues"
  > {
    const queuedSessions = this.queuedFullRun
      ? Math.max(1, this.debouncedSessions.size + this.queuedSessionKeys.size)
      : new Set([...this.debouncedSessions, ...this.queuedSessionKeys]).size;
    const stats = this.retriever.getRuntimeStats();
    const diagnostics = this.collectMemoryBoundaryDiagnostics();
    return {
      queuedSessions,
      lastRecallMs: stats.lastRecallMs,
      recallTimeouts: stats.recallTimeouts,
      lastRecallMode: stats.lastRecallMode,
      currentReasoningMode: this.indexer.getSettings().reasoningMode,
      lastRecallPath: stats.lastRecallPath,
      lastRecallBudgetLimited: stats.lastRecallBudgetLimited,
      lastShadowDeepQueued: stats.lastShadowDeepQueued,
      lastRecallInjected: stats.lastRecallInjected,
      lastRecallEnoughAt: stats.lastRecallEnoughAt,
      lastRecallCacheHit: stats.lastRecallCacheHit,
      slotOwner: diagnostics.slotOwner,
      dynamicMemoryRuntime: diagnostics.dynamicMemoryRuntime,
      workspaceBootstrapPresent: diagnostics.workspaceBootstrapPresent,
      memoryRuntimeHealthy: diagnostics.memoryRuntimeHealthy,
      runtimeIssues: diagnostics.runtimeIssues,
    };
  }

  private clearIdleTimer(sessionKey: string): void {
    const timer = this.idleIndexTimers.get(sessionKey);
    if (timer) {
      clearTimeout(timer);
      this.idleIndexTimers.delete(sessionKey);
    }
    this.debouncedSessions.delete(sessionKey);
  }

  private async drainIndexQueue(): Promise<HeartbeatStats> {
    let aggregate = emptyStats();
    try {
      while (this.queuedFullRun || this.queuedSessionKeys.size > 0) {
        const reason = this.queuedReason || "heartbeat";
        const runAll = this.queuedFullRun;
        const sessionKeys = runAll ? undefined : Array.from(this.queuedSessionKeys);
        this.queuedFullRun = false;
        this.queuedSessionKeys.clear();
        this.queuedReason = "";

        this.indexingInProgress = true;
        const stats = runAll
          ? await this.indexer.runHeartbeat({ reason })
          : await this.indexer.runHeartbeat({ reason, sessionKeys: sessionKeys ?? [] });
        aggregate = mergeStats(aggregate, stats);
        logIndexStats(this.logger, reason, stats);
      }
    } finally {
      this.indexingInProgress = false;
      this.queuePromise = undefined;
    }
    return aggregate;
  }

  private requestIndexRun(reason: string, sessionKeys?: string[]): Promise<HeartbeatStats> {
    if (sessionKeys && sessionKeys.length > 0) {
      sessionKeys.filter(Boolean).forEach((sessionKey) => this.queuedSessionKeys.add(sessionKey));
    } else {
      this.queuedFullRun = true;
    }
    this.queuedReason = this.queuedReason ? `${this.queuedReason}+${reason}` : reason;
    if (!this.queuePromise) {
      this.queuePromise = this.drainIndexQueue();
    }
    return this.queuePromise;
  }

  private rescheduleHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    const intervalMinutes = this.config.autoIndexIntervalMinutes;
    if (intervalMinutes <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      for (const sessionKey of Array.from(this.debouncedSessions)) {
        this.clearIdleTimer(sessionKey);
      }
      void this.requestIndexRun("scheduled").catch((error) => {
        this.logger.warn?.(`[youarememory] scheduled index failed: ${String(error)}`);
      });
    }, intervalMinutes * 60_000);
  }

  private applyIndexingSettings(partial: Partial<IndexingSettings>): IndexingSettings {
    const merged = this.repository.saveIndexingSettings(
      {
        ...this.indexer.getSettings(),
        ...partial,
      },
      this.config.defaultIndexingSettings,
    );
    this.indexer.setSettings(merged);
    this.rescheduleHeartbeat();
    return merged;
  }

  private scheduleIdleIndex(sessionKey: string): void {
    this.clearIdleTimer(sessionKey);
    this.debouncedSessions.add(sessionKey);
    const delayMs = this.config.indexIdleDebounceMs;
    const timer = setTimeout(() => {
      this.idleIndexTimers.delete(sessionKey);
      this.debouncedSessions.delete(sessionKey);
      void this.requestIndexRun("message_capture", [sessionKey]).catch((error) => {
        this.logger.warn?.(`[youarememory] async message_capture failed: ${String(error)}`);
      });
    }, delayMs);
    this.idleIndexTimers.set(sessionKey, timer);
  }

  private flushSessionNow(sessionKey: string, reason: string): Promise<HeartbeatStats> {
    this.clearIdleTimer(sessionKey);
    return this.requestIndexRun(reason, [sessionKey]);
  }

  private flushAllNow(reason: string): Promise<HeartbeatStats> {
    for (const sessionKey of Array.from(this.debouncedSessions)) {
      this.clearIdleTimer(sessionKey);
    }
    return this.requestIndexRun(reason);
  }

  private startBackgroundRepair(): void {
    const repairedVersion = this.repository.getPipelineState("repairVersion");
    if (repairedVersion === MEMORY_REPAIR_VERSION) return;
    void (async () => {
      try {
        const repair = this.repository.repairL0Sessions((record) => sanitizeL0Record(record, this.config));
        this.repository.resetDerivedIndexes();
        const stats = await this.flushAllNow("repair");
        this.logger.info?.(
          `[youarememory] repaired l0 updated=${repair.updated} removed=${repair.removed}; rebuilt l1=${stats.l1Created}, l2_time=${stats.l2TimeUpdated}, l2_project=${stats.l2ProjectUpdated}, profile=${stats.profileUpdated}, failed=${stats.failed}`,
        );
        this.repository.setPipelineState("repairVersion", MEMORY_REPAIR_VERSION);
      } catch (error) {
        this.logger.warn?.(`[youarememory] startup repair failed: ${String(error)}`);
      }
    })();
  }

  private resolveWorkspaceDir(): string {
    const configured = getConfigString(this.apiConfig, ["agents", "defaults", "workspace"]);
    return resolve(configured || join(homedir(), ".openclaw", "workspace"));
  }

  private collectMemoryBoundaryDiagnostics(): MemoryBoundaryDiagnostics {
    const runtimeIssues: string[] = [];
    const slotOwner = getConfigString(this.apiConfig, ["plugins", "slots", "memory"]);
    if (slotOwner !== PLUGIN_ID) {
      runtimeIssues.push(`plugins.slots.memory=${slotOwner || "(empty)"}`);
    }
    if (getConfigBoolean(this.apiConfig, ["plugins", "entries", "memory-core", "enabled"]) !== false) {
      runtimeIssues.push("plugins.entries.memory-core.enabled should be false");
    }
    if (getConfigBoolean(this.apiConfig, ["hooks", "internal", "entries", "session-memory", "enabled"]) !== false) {
      runtimeIssues.push("hooks.internal.entries.session-memory.enabled should be false");
    }
    if (getConfigBoolean(this.apiConfig, ["agents", "defaults", "memorySearch", "enabled"]) !== false) {
      runtimeIssues.push("agents.defaults.memorySearch.enabled should be false");
    }
    if (getConfigBoolean(this.apiConfig, ["agents", "defaults", "compaction", "memoryFlush", "enabled"]) !== false) {
      runtimeIssues.push("agents.defaults.compaction.memoryFlush.enabled should be false");
    }
    if (getConfigBoolean(this.apiConfig, ["plugins", "entries", PLUGIN_ID, "hooks", "allowPromptInjection"]) === false) {
      runtimeIssues.push(`plugins.entries.${PLUGIN_ID}.hooks.allowPromptInjection should not be false`);
    }
    if (!this.config.recallEnabled) {
      runtimeIssues.push("plugin config recallEnabled=false");
    }

    const workspaceDir = this.resolveWorkspaceDir();
    const workspaceBootstrapPresent = [
      "AGENTS.md",
      "SOUL.md",
      "TOOLS.md",
      "IDENTITY.md",
      "USER.md",
      "HEARTBEAT.md",
      "BOOTSTRAP.md",
      "MEMORY.md",
    ].some((name) => existsSync(join(workspaceDir, name)));

    return {
      slotOwner,
      dynamicMemoryRuntime: slotOwner === PLUGIN_ID ? "YouAreMemory" : slotOwner || "unbound",
      workspaceBootstrapPresent,
      memoryRuntimeHealthy: runtimeIssues.length === 0,
      runtimeIssues,
    };
  }

  private logMemoryBoundaryDiagnostics(): void {
    const diagnostics = this.collectMemoryBoundaryDiagnostics();
    if (diagnostics.memoryRuntimeHealthy) {
      this.logger.info?.("[youarememory] dynamic memory runtime ready: active memory slot is YouAreMemory.");
      return;
    }
    this.logger.warn?.(
      `[youarememory] dynamic memory runtime issues detected: ${diagnostics.runtimeIssues.join(" | ")}`,
    );
  }
}
