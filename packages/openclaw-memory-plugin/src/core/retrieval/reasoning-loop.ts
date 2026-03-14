import type {
  GlobalProfileRecord,
  IndexingSettings,
  L0SearchResult,
  L0SessionRecord,
  L1SearchResult,
  L2SearchResult,
  RecallMode,
  RetrievalResult,
} from "../types.js";
import { LlmMemoryExtractor } from "../skills/llm-extraction.js";
import { MemoryRepository } from "../storage/sqlite.js";
import { truncate } from "../utils/text.js";
import type { SkillsRuntime } from "../skills/types.js";

const RECALL_CACHE_TTL_MS = 30_000;

export interface RetrievalOptions {
  l2Limit?: number;
  l1Limit?: number;
  l0Limit?: number;
  includeFacts?: boolean;
}

export interface RetrievalRuntimeOptions {
  getSettings?: () => IndexingSettings;
  isBackgroundBusy?: () => boolean;
}

export interface RetrievalRuntimeStats {
  lastRecallMs: number;
  recallTimeouts: number;
  lastRecallMode: RecallMode;
}

interface RecallCacheEntry {
  expiresAt: number;
  result: RetrievalResult;
}

interface LocalCandidates {
  profile: { item: GlobalProfileRecord; score: number } | null;
  l2: L2SearchResult[];
  l1: L1SearchResult[];
  l0: L0SessionRecord[];
}

function renderProfile(profile: GlobalProfileRecord | null): string {
  if (!profile?.profileText.trim()) return "";
  return ["## Global Profile", profile.profileText].join("\n");
}

function renderL2(results: L2SearchResult[]): string {
  if (results.length === 0) return "";
  const lines: string[] = ["## L2 Indexes"];
  for (const hit of results) {
    if (hit.level === "l2_time") {
      lines.push(`- [time:${hit.item.dateKey}] ${truncate(hit.item.summary, 180)}`);
    } else {
      lines.push(`- [project:${hit.item.projectName}] status=${hit.item.currentStatus} | ${truncate(hit.item.latestProgress, 120)}`);
    }
  }
  return lines.join("\n");
}

function renderL1(results: L1SearchResult[]): string {
  if (results.length === 0) return "";
  const lines: string[] = ["## L1 Windows"];
  for (const hit of results) {
    lines.push(`- [${hit.item.timePeriod}] ${truncate(hit.item.summary, 180)}`);
  }
  return lines.join("\n");
}

function renderL0(results: L0SearchResult[]): string {
  if (results.length === 0) return "";
  const lines: string[] = ["## L0 Raw Sessions"];
  for (const hit of results) {
    const userMessages = hit.item.messages.filter((message) => message.role === "user").map((message) => message.content);
    lines.push(`- [${hit.item.timestamp}] ${truncate(userMessages[userMessages.length - 1] ?? "", 180)}`);
  }
  return lines.join("\n");
}

function renderContextTemplate(
  template: string,
  input: {
    intent: RetrievalResult["intent"];
    enoughAt: RetrievalResult["enoughAt"];
    profileBlock: string;
    l2Block: string;
    l1Block: string;
    l0Block: string;
  },
): string {
  let content = template;
  content = content.replaceAll("{{intent}}", input.intent);
  content = content.replaceAll("{{enoughAt}}", input.enoughAt);
  content = content.replaceAll("{{profileBlock}}", input.profileBlock);
  content = content.replaceAll("{{l2Block}}", input.l2Block);
  content = content.replaceAll("{{l1Block}}", input.l1Block);
  content = content.replaceAll("{{l0Block}}", input.l0Block);
  return content.trim();
}

function toRankScore(index: number): number {
  return Math.max(0.1, 1 - index * 0.12);
}

function coerceEnoughAt(
  enoughAt: RetrievalResult["enoughAt"],
  input: { l2: number; l1: number; l0: number },
): RetrievalResult["enoughAt"] {
  if (enoughAt === "l2" && input.l2 > 0) return "l2";
  if (enoughAt === "l1" && input.l1 > 0) return "l1";
  if (enoughAt === "l0" && input.l0 > 0) return "l0";
  if (input.l2 > 0) return "l2";
  if (input.l1 > 0) return "l1";
  if (input.l0 > 0) return "l0";
  return "none";
}

function normalizeQueryKey(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectFallbackBias(query: string): "time" | "project" | "fact" | "general" {
  const normalized = normalizeQueryKey(query);
  if (/(今天|今日|最近|近况|刚刚|today|recent|lately|what happened)/.test(normalized)) return "time";
  if (/(喜欢|偏好|习惯|身份|我是|语言|风格|profile|preference|language|like to)/.test(normalized)) return "fact";
  if (/(项目|论文|投稿|进展|工作流|project|paper|submission|progress)/.test(normalized)) return "project";
  return "general";
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /timeout/i.test(error.message);
}

function withDebug(result: RetrievalResult, debug: RetrievalResult["debug"]): RetrievalResult {
  if (!debug) return result;
  return { ...result, debug };
}

export class ReasoningRetriever {
  private readonly cache = new Map<string, RecallCacheEntry>();
  private runtimeStats: RetrievalRuntimeStats = {
    lastRecallMs: 0,
    recallTimeouts: 0,
    lastRecallMode: "none",
  };

  constructor(
    private readonly repository: MemoryRepository,
    private readonly skills: SkillsRuntime,
    private readonly extractor: LlmMemoryExtractor,
    private readonly runtime: RetrievalRuntimeOptions = {},
  ) {}

  getRuntimeStats(): RetrievalRuntimeStats {
    return { ...this.runtimeStats };
  }

  private currentSettings(): IndexingSettings {
    return this.runtime.getSettings?.() ?? {
      autoIndexIntervalMinutes: 60,
      recallBudgetMs: 700,
      indexIdleDebounceMs: 2500,
      fastRecallFallbackEnabled: true,
    };
  }

  private buildCacheKey(query: string, settings: IndexingSettings): string {
    return JSON.stringify({
      query: normalizeQueryKey(query),
      snapshot: this.repository.getSnapshotVersion(),
      settings: {
        recallBudgetMs: settings.recallBudgetMs,
        fastRecallFallbackEnabled: settings.fastRecallFallbackEnabled,
      },
    });
  }

  private getCachedResult(cacheKey: string): RetrievalResult | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    return cached.result;
  }

  private saveCachedResult(cacheKey: string, result: RetrievalResult): void {
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + RECALL_CACHE_TTL_MS,
      result,
    });
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
  }

  private buildLocalCandidates(query: string, options: RetrievalOptions): LocalCandidates {
    const l2Limit = Math.max(2, Math.min(3, options.l2Limit ?? 4));
    const l1Limit = Math.max(1, Math.min(2, options.l1Limit ?? 2));
    const l0Limit = Math.max(0, Math.min(1, options.l0Limit ?? 1));
    const profile = options.includeFacts === false ? null : this.repository.shortlistGlobalProfile(query);

    const l2 = this.repository.searchL2Hits(query, Math.max(4, l2Limit));
    const l2WithDiversity = [...l2];
    if (!l2WithDiversity.some((hit) => hit.level === "l2_time")) {
      const recentTime = this.repository.listRecentL2Time(1)[0];
      if (recentTime) {
        l2WithDiversity.push({ level: "l2_time", score: 0.16, item: recentTime });
      }
    }
    if (!l2WithDiversity.some((hit) => hit.level === "l2_project")) {
      const recentProject = this.repository.listRecentL2Projects(1)[0];
      if (recentProject) {
        l2WithDiversity.push({ level: "l2_project", score: 0.14, item: recentProject });
      }
    }
    const uniqueL2 = Array.from(
      new Map(l2WithDiversity
        .sort((left, right) => right.score - left.score)
        .map((hit) => [hit.item.l2IndexId, hit]))
        .values(),
    ).slice(0, l2Limit);

    const l1 = this.repository.searchL1Hits(query, Math.max(4, l1Limit));
    const l0 = l0Limit > 0
      ? this.repository.getL0ByL1Ids(l1.slice(0, 2).map((hit) => hit.item.l1IndexId), l0Limit)
      : [];

    return {
      profile,
      l2: uniqueL2,
      l1: l1.slice(0, l1Limit),
      l0: l0.slice(0, l0Limit),
    };
  }

  private buildContext(
    intent: RetrievalResult["intent"],
    enoughAt: RetrievalResult["enoughAt"],
    profile: GlobalProfileRecord | null,
    l2Results: L2SearchResult[],
    l1Results: L1SearchResult[],
    l0Results: L0SearchResult[],
  ): string {
    return renderContextTemplate(this.skills.contextTemplate, {
      intent,
      enoughAt,
      profileBlock: renderProfile(profile),
      l2Block: renderL2(l2Results),
      l1Block: renderL1(l1Results),
      l0Block: renderL0(l0Results),
    });
  }

  private buildLocalFallback(
    query: string,
    candidates: LocalCandidates,
    options: RetrievalOptions,
    mode: RecallMode,
    elapsedMs: number,
    cacheHit: boolean,
  ): RetrievalResult {
    const settings = this.currentSettings();
    const bias = detectFallbackBias(query);
    const profile = settings.fastRecallFallbackEnabled && (candidates.profile?.score ?? 0) > 0.12
      ? candidates.profile!.item
      : null;
    const l2Results = settings.fastRecallFallbackEnabled
      ? (() => {
          const limit = Math.min(2, options.l2Limit ?? 2);
          const selected: L2SearchResult[] = [];
          const topProject = candidates.l2.find((hit) => hit.level === "l2_project");
          const topTime = candidates.l2.find((hit) => hit.level === "l2_time");
          if (bias === "time") {
            if (topTime) selected.push(topTime);
            if (topProject) selected.push(topProject);
          } else {
            if (topProject) selected.push(topProject);
            if (topTime) selected.push(topTime);
          }
          for (const hit of candidates.l2) {
            if (selected.length >= limit) break;
            if (selected.some((item) => item.item.l2IndexId === hit.item.l2IndexId)) continue;
            selected.push(hit);
          }
          return selected.slice(0, limit);
        })()
      : [];
    if (bias === "fact" && profile) {
      return withDebug({
        query,
        intent: "fact",
        enoughAt: "none",
        profile,
        l2Results: [],
        l1Results: [],
        l0Results: [],
        context: this.buildContext("fact", "none", profile, [], [], []),
      }, {
        mode,
        elapsedMs,
        cacheHit,
      });
    }

    const enoughAt = coerceEnoughAt("l2", { l2: l2Results.length, l1: 0, l0: 0 });
    const intent = bias === "general"
      ? l2Results[0]?.level === "l2_project"
        ? "project"
        : l2Results[0]?.level === "l2_time"
          ? "time"
          : profile
            ? "fact"
            : "general"
      : bias;
    return withDebug({
      query,
      intent,
      enoughAt,
      profile,
      l2Results,
      l1Results: [],
      l0Results: [],
      context: this.buildContext(intent, enoughAt, profile, l2Results, [], []),
    }, {
      mode,
      elapsedMs,
      cacheHit,
    });
  }

  private updateRuntimeStats(mode: RecallMode, elapsedMs: number, timedOut = false): void {
    this.runtimeStats.lastRecallMs = elapsedMs;
    this.runtimeStats.lastRecallMode = mode;
    if (timedOut) {
      this.runtimeStats.recallTimeouts += 1;
    }
  }

  async searchL2(query: string, _intent: RetrievalResult["intent"], limit: number): Promise<L2SearchResult[]> {
    const candidates = this.buildLocalCandidates(query, { l2Limit: Math.max(2, limit), l1Limit: 0, l0Limit: 0 });
    if (this.runtime.isBackgroundBusy?.()) {
      return candidates.l2.slice(0, limit);
    }
    try {
      const selection = await this.extractor.reasonOverMemory({
        query,
        profile: null,
        l2Time: candidates.l2.filter((hit) => hit.level === "l2_time").map((hit) => hit.item),
        l2Projects: candidates.l2.filter((hit) => hit.level === "l2_project").map((hit) => hit.item),
        l1Windows: [],
        l0Sessions: [],
        limits: { l2: limit, l1: 0, l0: 0 },
        timeoutMs: this.currentSettings().recallBudgetMs,
      });
      const byId = new Map(candidates.l2.map((hit) => [hit.item.l2IndexId, hit]));
      return selection.l2Ids
        .map((id, index) => {
          const hit = byId.get(id);
          return hit ? { ...hit, score: toRankScore(index) } : undefined;
        })
        .filter((hit): hit is L2SearchResult => Boolean(hit))
        .slice(0, limit);
    } catch {
      return candidates.l2.slice(0, limit);
    }
  }

  async searchL1(query: string, relatedL1Ids: string[], limit: number): Promise<L1SearchResult[]> {
    const related = this.repository.getL1ByIds(relatedL1Ids).map((item, index) => ({ item, score: toRankScore(index) }));
    const local = this.repository.searchL1Hits(query, Math.max(limit, 4));
    const merged = new Map<string, L1SearchResult>();
    [...related, ...local].forEach((hit) => merged.set(hit.item.l1IndexId, hit));
    return Array.from(merged.values()).slice(0, limit);
  }

  async searchL0(_query: string, relatedL0Ids: string[], limit: number): Promise<L0SearchResult[]> {
    return this.repository.getL0ByIds(relatedL0Ids).slice(0, limit).map((item, index) => ({
      score: toRankScore(index),
      item,
    }));
  }

  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult> {
    const startedAt = Date.now();
    const settings = this.currentSettings();
    const cacheKey = this.buildCacheKey(query, settings);
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      const elapsedMs = Date.now() - startedAt;
      this.updateRuntimeStats(cached.debug?.mode ?? "none", elapsedMs, false);
      return withDebug(cached, {
        mode: cached.debug?.mode ?? "none",
        elapsedMs,
        cacheHit: true,
      });
    }

    const candidates = this.buildLocalCandidates(query, options);
    if (!candidates.profile && candidates.l2.length === 0 && candidates.l1.length === 0 && candidates.l0.length === 0) {
      const result = withDebug({
        query,
        intent: "general",
        enoughAt: "none",
        profile: null,
        l2Results: [],
        l1Results: [],
        l0Results: [],
        context: "",
      }, {
        mode: "none",
        elapsedMs: Date.now() - startedAt,
        cacheHit: false,
      });
      this.updateRuntimeStats("none", result.debug?.elapsedMs ?? 0, false);
      this.saveCachedResult(cacheKey, result);
      return result;
    }

    if (this.runtime.isBackgroundBusy?.()) {
      const fallback = this.buildLocalFallback(query, candidates, options, "local_fallback", Date.now() - startedAt, false);
      this.updateRuntimeStats("local_fallback", fallback.debug?.elapsedMs ?? 0, false);
      this.saveCachedResult(cacheKey, fallback);
      return fallback;
    }

    try {
      const includeLowerLevels = (candidates.l2[0]?.score ?? 0) < 0.2 && (candidates.profile?.score ?? 0) < 0.18;
      const selection = await this.extractor.reasonOverMemory({
        query,
        profile: candidates.profile?.item ?? null,
        l2Time: candidates.l2.filter((hit) => hit.level === "l2_time").map((hit) => hit.item),
        l2Projects: candidates.l2.filter((hit) => hit.level === "l2_project").map((hit) => hit.item),
        l1Windows: includeLowerLevels ? candidates.l1.map((hit) => hit.item) : [],
        l0Sessions: includeLowerLevels ? candidates.l0 : [],
        limits: {
          l2: Math.min(4, options.l2Limit ?? 4),
          l1: includeLowerLevels ? Math.min(2, options.l1Limit ?? 2) : 0,
          l0: includeLowerLevels ? Math.min(1, options.l0Limit ?? 1) : 0,
        },
        timeoutMs: settings.recallBudgetMs,
      });

      const l2ById = new Map(candidates.l2.map((hit) => [hit.item.l2IndexId, hit]));
      const l1ById = new Map(candidates.l1.map((hit) => [hit.item.l1IndexId, hit.item]));
      const l0ById = new Map(candidates.l0.map((item) => [item.l0IndexId, item]));

      const l2Results = selection.l2Ids
        .map((id, index) => {
          const hit = l2ById.get(id);
          return hit ? { ...hit, score: toRankScore(index) } : undefined;
        })
        .filter((hit): hit is L2SearchResult => Boolean(hit))
        .slice(0, options.l2Limit ?? 4);

      const l1Results = selection.l1Ids
        .map((id, index) => {
          const item = l1ById.get(id);
          return item ? { score: toRankScore(index), item } : undefined;
        })
        .filter((hit): hit is L1SearchResult => Boolean(hit))
        .slice(0, options.l1Limit ?? 2);

      let l0Results = selection.l0Ids
        .map((id, index) => {
          const item = l0ById.get(id);
          return item ? { score: toRankScore(index), item } : undefined;
        })
        .filter((hit): hit is L0SearchResult => Boolean(hit))
        .slice(0, options.l0Limit ?? 1);

      if (l0Results.length === 0 && selection.enoughAt === "l0" && l1Results.length > 0) {
        l0Results = this.repository.getL0ByL1Ids(l1Results.map((hit) => hit.item.l1IndexId), Math.min(1, options.l0Limit ?? 1))
          .map((item, index) => ({ score: toRankScore(index), item }));
      }

      const profile = selection.useProfile ? (candidates.profile?.item ?? null) : null;
      if (!profile && l2Results.length === 0 && l1Results.length === 0 && l0Results.length === 0) {
        const fallback = this.buildLocalFallback(query, candidates, options, "local_fallback", Date.now() - startedAt, false);
        this.updateRuntimeStats("local_fallback", fallback.debug?.elapsedMs ?? 0, false);
        this.saveCachedResult(cacheKey, fallback);
        return fallback;
      }

      const enoughAt = coerceEnoughAt(selection.enoughAt, {
        l2: l2Results.length,
        l1: l1Results.length,
        l0: l0Results.length,
      });
      const result = withDebug({
        query,
        intent: selection.intent,
        enoughAt,
        profile,
        l2Results,
        l1Results,
        l0Results,
        context: this.buildContext(selection.intent, enoughAt, profile, l2Results, l1Results, l0Results),
      }, {
        mode: "llm",
        elapsedMs: Date.now() - startedAt,
        cacheHit: false,
      });
      this.updateRuntimeStats("llm", result.debug?.elapsedMs ?? 0, false);
      this.saveCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const timedOut = isTimeoutError(error) || elapsedMs >= settings.recallBudgetMs - 25;
      const mode: RecallMode = settings.fastRecallFallbackEnabled ? "local_fallback" : "none";
      const result = settings.fastRecallFallbackEnabled
        ? this.buildLocalFallback(query, candidates, options, mode, elapsedMs, false)
        : withDebug({
            query,
            intent: "general",
            enoughAt: "none",
            profile: null,
            l2Results: [],
            l1Results: [],
            l0Results: [],
            context: "",
          }, {
            mode,
            elapsedMs,
            cacheHit: false,
          });
      this.updateRuntimeStats(mode, elapsedMs, timedOut);
      this.saveCachedResult(cacheKey, result);
      return result;
    }
  }
}
