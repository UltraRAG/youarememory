import type { IndexingSettings } from "./core/types.js";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PluginRuntimeConfig {
  dataDir: string;
  dbPath: string;
  skillsDir?: string;
  captureStrategy: "last_turn" | "full_session";
  includeAssistant: boolean;
  maxMessageChars: number;
  heartbeatBatchSize: number;
  autoIndexIntervalMinutes: number;
  indexIdleDebounceMs: number;
  defaultIndexingSettings: IndexingSettings;
  recallEnabled: boolean;
  addEnabled: boolean;
  uiEnabled: boolean;
  uiHost: string;
  uiPort: number;
  uiPathPrefix: string;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function toInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function buildPluginConfig(raw: unknown): PluginRuntimeConfig {
  const cfg = (raw ?? {}) as Record<string, unknown>;
  const dataDir = typeof cfg.dataDir === "string" && cfg.dataDir.trim()
    ? cfg.dataDir
    : join(homedir(), ".openclaw", "youarememory");
  const dbPath = typeof cfg.dbPath === "string" && cfg.dbPath.trim()
    ? cfg.dbPath
    : join(dataDir, "memory.sqlite");
  const skillsDir = typeof cfg.skillsDir === "string" && cfg.skillsDir.trim() ? cfg.skillsDir : undefined;

  const configuredLatency = typeof cfg.maxAutoReplyLatencyMs === "number" && Number.isFinite(cfg.maxAutoReplyLatencyMs)
    ? Math.floor(cfg.maxAutoReplyLatencyMs)
    : typeof cfg.maxAutoReplyLatencyMs === "string" && cfg.maxAutoReplyLatencyMs.trim()
      ? Number.parseInt(cfg.maxAutoReplyLatencyMs, 10)
      : typeof cfg.recallBudgetMs === "number" && Number.isFinite(cfg.recallBudgetMs)
        ? Math.floor(cfg.recallBudgetMs)
        : typeof cfg.recallBudgetMs === "string" && cfg.recallBudgetMs.trim()
          ? Number.parseInt(cfg.recallBudgetMs, 10)
          : 1800;
  const captureStrategy = cfg.captureStrategy === "last_turn" ? "last_turn" : "full_session";
  const runtime: PluginRuntimeConfig = {
    dataDir,
    dbPath,
    captureStrategy,
    includeAssistant: toBoolean(cfg.includeAssistant, true),
    maxMessageChars: toInteger(cfg.maxMessageChars, 6000),
    heartbeatBatchSize: Math.max(1, toInteger(cfg.heartbeatBatchSize, 30)),
    autoIndexIntervalMinutes: Math.max(0, toInteger(cfg.autoIndexIntervalMinutes, 60)),
    indexIdleDebounceMs: Math.max(200, toInteger(cfg.indexIdleDebounceMs, 2500)),
    defaultIndexingSettings: {
      reasoningMode: cfg.reasoningMode === "accuracy_first" ? "accuracy_first" : "answer_first",
      maxAutoReplyLatencyMs: Math.max(300, Number.isFinite(configuredLatency) ? configuredLatency : 1800),
    },
    recallEnabled: toBoolean(cfg.recallEnabled, true),
    addEnabled: toBoolean(cfg.addEnabled, true),
    uiEnabled: toBoolean(cfg.uiEnabled, true),
    uiHost: typeof cfg.uiHost === "string" && cfg.uiHost.trim() ? cfg.uiHost : "127.0.0.1",
    uiPort: Math.max(1024, toInteger(cfg.uiPort, 39393)),
    uiPathPrefix: typeof cfg.uiPathPrefix === "string" && cfg.uiPathPrefix.trim() ? cfg.uiPathPrefix : "/youarememory",
  };
  if (skillsDir) {
    runtime.skillsDir = skillsDir;
  }
  return runtime;
}
