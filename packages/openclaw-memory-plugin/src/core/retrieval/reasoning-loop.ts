import type {
  GlobalProfileRecord,
  IntentType,
  L0SearchResult,
  L1SearchResult,
  L2SearchResult,
  RetrievalResult,
} from "../types.js";
import { LlmMemoryExtractor } from "../skills/llm-extraction.js";
import { MemoryRepository } from "../storage/sqlite.js";
import { truncate } from "../utils/text.js";
import type { SkillsRuntime } from "../skills/types.js";

export interface RetrievalOptions {
  l2Limit?: number;
  l1Limit?: number;
  l0Limit?: number;
  includeFacts?: boolean;
}

function renderProfile(profile: GlobalProfileRecord | null): string {
  if (!profile?.profileText.trim()) return "";
  return [
    "## Global Profile",
    profile.profileText,
  ].join("\n");
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
    intent: IntentType;
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
  return Math.max(0.1, 1 - index * 0.1);
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

export class ReasoningRetriever {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly skills: SkillsRuntime,
    private readonly extractor: LlmMemoryExtractor,
  ) {}

  private async searchProfile(query: string): Promise<GlobalProfileRecord | null> {
    const profile = this.repository.getGlobalProfileRecord();
    if (!profile.profileText.trim()) return null;
    const selection = await this.extractor.reasonOverMemory({
      query,
      profile,
      l2Time: [],
      l2Projects: [],
      l1Windows: [],
      l0Sessions: [],
      limits: { l2: 0, l1: 0, l0: 0 },
    });
    return selection.useProfile ? profile : null;
  }

  async searchL2(query: string, _intent: IntentType, limit: number): Promise<L2SearchResult[]> {
    const profile = this.repository.getGlobalProfileRecord();
    const l2Time = this.repository.listRecentL2Time(Math.max(12, limit * 4));
    const l2Projects = this.repository.listRecentL2Projects(Math.max(12, limit * 4));
    const selection = await this.extractor.reasonOverMemory({
      query,
      profile: profile.profileText.trim() ? profile : null,
      l2Time,
      l2Projects,
      l1Windows: [],
      l0Sessions: [],
      limits: { l2: limit, l1: 0, l0: 0 },
    });
    const byId = new Map<string, L2SearchResult>();
    l2Time.forEach((item) => byId.set(item.l2IndexId, { level: "l2_time", score: 0, item }));
    l2Projects.forEach((item) => byId.set(item.l2IndexId, { level: "l2_project", score: 0, item }));
    return selection.l2Ids
      .map((id, index) => {
        const hit = byId.get(id);
        return hit ? { ...hit, score: toRankScore(index) } : undefined;
      })
      .filter((hit): hit is L2SearchResult => Boolean(hit))
      .slice(0, limit);
  }

  async searchL1(query: string, relatedL1Ids: string[], limit: number): Promise<L1SearchResult[]> {
    const recent = this.repository.listRecentL1(Math.max(12, limit * 4));
    const related = this.repository.getL1ByIds(relatedL1Ids);
    const merged = new Map<string, (typeof recent)[number]>();
    [...related, ...recent].forEach((item) => merged.set(item.l1IndexId, item));
    const candidates = Array.from(merged.values());
    const selection = await this.extractor.reasonOverMemory({
      query,
      profile: null,
      l2Time: [],
      l2Projects: [],
      l1Windows: candidates,
      l0Sessions: [],
      limits: { l2: 0, l1: limit, l0: 0 },
    });
    const byId = new Map(candidates.map((item) => [item.l1IndexId, item]));
    return selection.l1Ids
      .map((id, index) => {
        const item = byId.get(id);
        return item ? { score: toRankScore(index), item } : undefined;
      })
      .filter((hit): hit is L1SearchResult => Boolean(hit))
      .slice(0, limit);
  }

  async searchL0(query: string, relatedL0Ids: string[], limit: number): Promise<L0SearchResult[]> {
    const recent = this.repository.listRecentL0(Math.max(12, limit * 4));
    const related = this.repository.getL0ByIds(relatedL0Ids);
    const merged = new Map<string, (typeof recent)[number]>();
    [...related, ...recent].forEach((item) => merged.set(item.l0IndexId, item));
    const candidates = Array.from(merged.values());
    const selection = await this.extractor.reasonOverMemory({
      query,
      profile: null,
      l2Time: [],
      l2Projects: [],
      l1Windows: [],
      l0Sessions: candidates,
      limits: { l2: 0, l1: 0, l0: limit },
    });
    const byId = new Map(candidates.map((item) => [item.l0IndexId, item]));
    return selection.l0Ids
      .map((id, index) => {
        const item = byId.get(id);
        return item ? { score: toRankScore(index), item } : undefined;
      })
      .filter((hit): hit is L0SearchResult => Boolean(hit))
      .slice(0, limit);
  }

  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult> {
    const l2Limit = options.l2Limit ?? 6;
    const l1Limit = options.l1Limit ?? 6;
    const l0Limit = options.l0Limit ?? 4;
    const profileCandidate = options.includeFacts === false ? null : this.repository.getGlobalProfileRecord();
    const profile = profileCandidate?.profileText.trim() ? profileCandidate : null;

    const l2Time = this.repository.listRecentL2Time(Math.max(12, l2Limit * 4));
    const l2Projects = this.repository.listRecentL2Projects(Math.max(12, l2Limit * 4));
    const l1Windows = this.repository.listRecentL1(Math.max(12, l1Limit * 4));
    const l0Sessions = this.repository.listRecentL0(Math.max(12, l0Limit * 4));

    const selection = await this.extractor.reasonOverMemory({
      query,
      profile,
      l2Time,
      l2Projects,
      l1Windows,
      l0Sessions,
      limits: { l2: l2Limit, l1: l1Limit, l0: l0Limit },
    });

    const l2ById = new Map<string, L2SearchResult>();
    l2Time.forEach((item) => l2ById.set(item.l2IndexId, { level: "l2_time", score: 0, item }));
    l2Projects.forEach((item) => l2ById.set(item.l2IndexId, { level: "l2_project", score: 0, item }));
    const l1ById = new Map(l1Windows.map((item) => [item.l1IndexId, item]));
    const l0ById = new Map(l0Sessions.map((item) => [item.l0IndexId, item]));

    let l2Results = selection.l2Ids
      .map((id, index) => {
        const hit = l2ById.get(id);
        return hit ? { ...hit, score: toRankScore(index) } : undefined;
      })
      .filter((hit): hit is L2SearchResult => Boolean(hit))
      .slice(0, l2Limit);

    let l1Results = selection.l1Ids
      .map((id, index) => {
        const item = l1ById.get(id);
        return item ? { score: toRankScore(index), item } : undefined;
      })
      .filter((hit): hit is L1SearchResult => Boolean(hit))
      .slice(0, l1Limit);

    let l0Results = selection.l0Ids
      .map((id, index) => {
        const item = l0ById.get(id);
        return item ? { score: toRankScore(index), item } : undefined;
      })
      .filter((hit): hit is L0SearchResult => Boolean(hit))
      .slice(0, l0Limit);

    let selectedProfile = selection.useProfile ? profile : null;
    if (!selectedProfile && options.includeFacts !== false) {
      selectedProfile = await this.searchProfile(query);
    }
    if (l2Results.length === 0) {
      l2Results = await this.searchL2(query, selection.intent, l2Limit);
    }
    if (l1Results.length === 0) {
      const relatedL1Ids = Array.from(new Set(l2Results.flatMap((hit) => hit.item.l1Source)));
      l1Results = await this.searchL1(query, relatedL1Ids, l1Limit);
    }
    if (l0Results.length === 0) {
      const relatedL0Ids = Array.from(new Set(l1Results.flatMap((hit) => hit.item.l0Source)));
      l0Results = await this.searchL0(query, relatedL0Ids, l0Limit);
    }

    const enoughAt = coerceEnoughAt(selection.enoughAt, {
      l2: l2Results.length,
      l1: l1Results.length,
      l0: l0Results.length,
    });

    const context = renderContextTemplate(this.skills.contextTemplate, {
      intent: selection.intent,
      enoughAt,
      profileBlock: renderProfile(selectedProfile),
      l2Block: renderL2(l2Results),
      l1Block: renderL1(l1Results),
      l0Block: renderL0(l0Results),
    });

    return {
      query,
      intent: selection.intent,
      enoughAt,
      profile: selectedProfile,
      l2Results,
      l1Results,
      l0Results,
      context,
    };
  }
}
