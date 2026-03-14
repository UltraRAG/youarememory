import type {
  ActiveTopicBufferRecord,
  IndexingSettings,
  L0SessionRecord,
  MemoryMessage,
  ProjectDetail,
} from "../types.js";
import { buildL0IndexId, nowIso } from "../utils/id.js";
import { extractL1FromWindow } from "../indexers/l1-extractor.js";
import { buildL2ProjectsFromL1, buildL2TimeFromL1 } from "../indexers/l2-builder.js";
import { LlmMemoryExtractor } from "../skills/llm-extraction.js";
import { MemoryRepository } from "../storage/sqlite.js";

export interface HeartbeatOptions {
  batchSize?: number;
  source?: string;
  settings: IndexingSettings;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
}

export interface HeartbeatRunOptions {
  batchSize?: number;
  sessionKeys?: string[];
  reason?: string;
}

export interface HeartbeatStats {
  l0Captured: number;
  l1Created: number;
  l2TimeUpdated: number;
  l2ProjectUpdated: number;
  profileUpdated: number;
  failed: number;
}

function sameMessage(left: MemoryMessage | undefined, right: MemoryMessage | undefined): boolean {
  if (!left || !right) return false;
  return left.role === right.role && left.content === right.content;
}

function hasNewContent(previous: MemoryMessage[], incoming: MemoryMessage[]): boolean {
  if (incoming.length === 0) return false;
  if (previous.length === 0) return true;
  if (incoming.length > previous.length) return true;
  for (let index = 0; index < incoming.length; index += 1) {
    if (!sameMessage(previous[index], incoming[index])) return true;
  }
  return false;
}

function normalizeTurn(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function userTurnsFromRecord(record: L0SessionRecord): string[] {
  return record.messages
    .filter((message) => message.role === "user")
    .map((message) => normalizeTurn(message.content))
    .filter(Boolean);
}

function findTurnOverlap(existing: string[], incoming: string[]): number {
  const max = Math.min(existing.length, incoming.length);
  for (let size = max; size > 0; size -= 1) {
    let matched = true;
    for (let index = 0; index < size; index += 1) {
      if (existing[existing.length - size + index] !== incoming[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return size;
  }
  return 0;
}

function extractIncomingUserTurns(record: L0SessionRecord, buffer?: ActiveTopicBufferRecord): string[] {
  const turns = userTurnsFromRecord(record);
  if (!buffer || buffer.userTurns.length === 0) return turns;
  const overlap = findTurnOverlap(buffer.userTurns, turns);
  return turns.slice(overlap);
}

function summarizeTopicSeed(turns: string[]): string {
  const raw = normalizeTurn(turns[turns.length - 1] ?? turns[0] ?? "当前话题");
  return raw.length <= 120 ? raw : raw.slice(0, 120).trim();
}

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  const next = [...existing];
  for (const item of incoming) {
    if (!next.includes(item)) next.push(item);
  }
  return next;
}

function buildLocalDateKey(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10) || "unknown";
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mergeProjectDetail(existing: ProjectDetail, incoming: ProjectDetail): ProjectDetail {
  const statusRank: Record<ProjectDetail["status"], number> = {
    blocked: 5,
    in_progress: 4,
    planned: 3,
    on_hold: 2,
    done: 1,
    unknown: 0,
  };
  const preferredStatus = statusRank[incoming.status] >= statusRank[existing.status] ? incoming.status : existing.status;
  return {
    ...existing,
    name: incoming.name.length >= existing.name.length ? incoming.name : existing.name,
    status: preferredStatus,
    summary: incoming.summary || existing.summary,
    latestProgress: incoming.latestProgress || existing.latestProgress,
    confidence: Math.max(existing.confidence, incoming.confidence),
  };
}

async function canonicalizeL1Projects(
  projects: Awaited<ReturnType<typeof extractL1FromWindow>>["projectDetails"],
  repository: MemoryRepository,
  extractor: LlmMemoryExtractor,
): Promise<Awaited<ReturnType<typeof extractL1FromWindow>>["projectDetails"]> {
  if (projects.length === 0) return projects;
  const catalog = new Map<string, {
    projectKey: string;
    projectName: string;
    summary: string;
    currentStatus: ProjectDetail["status"];
    latestProgress: string;
  }>();
  for (const item of repository.listRecentL2Projects(60)) {
    catalog.set(item.projectKey, {
      projectKey: item.projectKey,
      projectName: item.projectName,
      summary: item.summary,
      currentStatus: item.currentStatus,
      latestProgress: item.latestProgress,
    });
  }

  const existingProjects = Array.from(catalog.values()).map((item) => ({
    l2IndexId: `catalog:${item.projectKey}`,
    projectKey: item.projectKey,
    projectName: item.projectName,
    summary: item.summary,
    currentStatus: item.currentStatus,
    latestProgress: item.latestProgress,
    l1Source: [],
    createdAt: "",
    updatedAt: "",
  }));
  const normalizedProjects = await extractor.resolveProjectIdentities({
    projects,
    existingProjects,
  });
  const resolved = new Map<string, ProjectDetail>();
  for (const normalized of normalizedProjects) {
    const merged = resolved.has(normalized.key)
      ? mergeProjectDetail(resolved.get(normalized.key)!, normalized)
      : normalized;
    resolved.set(merged.key, merged);
    catalog.set(merged.key, {
      projectKey: merged.key,
      projectName: merged.name,
      summary: merged.summary,
      currentStatus: merged.status,
      latestProgress: merged.latestProgress,
    });
  }

  return Array.from(resolved.values());
}

export class HeartbeatIndexer {
  private readonly batchSize: number;
  private readonly source: string;
  private readonly logger: HeartbeatOptions["logger"];
  private settings: IndexingSettings;

  constructor(
    private readonly repository: MemoryRepository,
    private readonly extractor: LlmMemoryExtractor,
    options: HeartbeatOptions,
  ) {
    this.batchSize = options.batchSize ?? 30;
    this.source = options.source ?? "openclaw";
    this.settings = options.settings;
    this.logger = options.logger;
  }

  getSettings(): IndexingSettings {
    return { ...this.settings };
  }

  setSettings(settings: IndexingSettings): void {
    this.settings = { ...settings };
  }

  captureL0Session(input: {
    sessionKey: string;
    timestamp?: string;
    messages: MemoryMessage[];
    source?: string;
  }): L0SessionRecord | undefined {
    const timestamp = input.timestamp ?? nowIso();
    const recent = this.repository.listRecentL0(1)[0];
    if (recent?.sessionKey === input.sessionKey && !hasNewContent(recent.messages, input.messages)) {
      this.logger?.info?.(`[youarememory] skip duplicate l0 capture for session=${input.sessionKey}`);
      return undefined;
    }
    const payload = JSON.stringify(input.messages);
    const l0IndexId = buildL0IndexId(input.sessionKey, timestamp, payload);
    const record: L0SessionRecord = {
      l0IndexId,
      sessionKey: input.sessionKey,
      timestamp,
      messages: input.messages,
      source: input.source ?? this.source,
      indexed: false,
      createdAt: nowIso(),
    };
    this.repository.insertL0Session(record);
    return record;
  }

  private createTopicBuffer(record: L0SessionRecord, incomingUserTurns: string[], topicSummary?: string): ActiveTopicBufferRecord {
    const seedTurns = incomingUserTurns.length > 0 ? incomingUserTurns : userTurnsFromRecord(record);
    const now = nowIso();
    return {
      sessionKey: record.sessionKey,
      startedAt: record.timestamp,
      updatedAt: record.timestamp,
      topicSummary: topicSummary?.trim() || summarizeTopicSeed(seedTurns),
      userTurns: seedTurns,
      l0Ids: [record.l0IndexId],
      lastL0Id: record.l0IndexId,
      createdAt: now,
    };
  }

  private createTopicBufferFromBatch(
    records: L0SessionRecord[],
    incomingUserTurns: string[],
    topicSummary?: string,
  ): ActiveTopicBufferRecord {
    const first = records[0]!;
    const last = records[records.length - 1]!;
    const seedTurns = incomingUserTurns.length > 0
      ? incomingUserTurns
      : records.flatMap((record) => userTurnsFromRecord(record));
    return {
      sessionKey: first.sessionKey,
      startedAt: first.timestamp,
      updatedAt: last.timestamp,
      topicSummary: topicSummary?.trim() || summarizeTopicSeed(seedTurns),
      userTurns: seedTurns,
      l0Ids: records.map((record) => record.l0IndexId),
      lastL0Id: last.l0IndexId,
      createdAt: nowIso(),
    };
  }

  private extendTopicBuffer(
    buffer: ActiveTopicBufferRecord,
    record: L0SessionRecord,
    incomingUserTurns: string[],
    topicSummary?: string,
  ): ActiveTopicBufferRecord {
    return {
      ...buffer,
      updatedAt: record.timestamp,
      topicSummary: topicSummary?.trim() || buffer.topicSummary || summarizeTopicSeed(buffer.userTurns),
      userTurns: mergeUniqueStrings(buffer.userTurns, incomingUserTurns),
      l0Ids: mergeUniqueStrings(buffer.l0Ids, [record.l0IndexId]),
      lastL0Id: record.l0IndexId,
    };
  }

  private async closeTopicBuffer(sessionKey: string, stats: HeartbeatStats, reason: string): Promise<void> {
    const buffer = this.repository.getActiveTopicBuffer(sessionKey);
    if (!buffer || buffer.l0Ids.length === 0) {
      if (buffer) this.repository.deleteActiveTopicBuffer(sessionKey);
      return;
    }

    const records = this.repository.getL0ByIds(buffer.l0Ids);
    if (records.length === 0) {
      this.repository.deleteActiveTopicBuffer(sessionKey);
      return;
    }

    const extracted = await extractL1FromWindow(records, this.extractor);
    const canonicalProjects = await canonicalizeL1Projects(extracted.projectDetails, this.repository, this.extractor);
    const l1 = {
      ...extracted,
      projectDetails: canonicalProjects,
      projectTags: canonicalProjects.map((project) => project.name),
    };
    this.repository.insertL1Window(l1);
    for (const l0 of records) {
      this.repository.insertLink("l1", l1.l1IndexId, "l0", l0.l0IndexId);
    }
    stats.l1Created += 1;

    const dateKey = buildLocalDateKey(l1.endedAt);
    const existingDay = this.repository.getL2TimeByDate(dateKey);
    const daySummary = await this.extractor.rewriteDailyTimeSummary({
      dateKey,
      existingSummary: existingDay?.summary ?? "",
      l1,
    });
    const l2Time = buildL2TimeFromL1(l1, daySummary);
    this.repository.upsertL2TimeIndex(l2Time);
    this.repository.insertLink("l2", l2Time.l2IndexId, "l1", l1.l1IndexId);
    stats.l2TimeUpdated += 1;

    const projectIndexes = buildL2ProjectsFromL1(l1);
    for (const l2Project of projectIndexes) {
      this.repository.upsertL2ProjectIndex(l2Project);
      this.repository.insertLink("l2", l2Project.l2IndexId, "l1", l1.l1IndexId);
      stats.l2ProjectUpdated += 1;
    }

    const currentProfile = this.repository.getGlobalProfileRecord();
    const nextProfileText = await this.extractor.rewriteGlobalProfile({
      existingProfile: currentProfile.profileText,
      l1,
    });
    this.repository.upsertGlobalProfile(nextProfileText, [l1.l1IndexId]);
    stats.profileUpdated += 1;

    this.repository.deleteActiveTopicBuffer(sessionKey);
    this.logger?.info?.(
      `[youarememory] closed topic session=${sessionKey} reason=${reason} l1=${l1.l1IndexId} l0=${records.length}`,
    );
  }

  private async closeOtherSessionBuffers(currentSessionKey: string, stats: HeartbeatStats, reason: string): Promise<void> {
    const openBuffers = this.repository.listActiveTopicBuffers();
    for (const buffer of openBuffers) {
      if (buffer.sessionKey === currentSessionKey) continue;
      await this.closeTopicBuffer(buffer.sessionKey, stats, `${reason}:session_boundary`);
    }
  }

  private async processPendingRecord(record: L0SessionRecord, stats: HeartbeatStats, reason: string): Promise<void> {
    await this.closeOtherSessionBuffers(record.sessionKey, stats, reason);

    const buffer = this.repository.getActiveTopicBuffer(record.sessionKey);
    const incomingUserTurns = extractIncomingUserTurns(record, buffer);
    if (!buffer) {
      this.repository.upsertActiveTopicBuffer(this.createTopicBuffer(record, incomingUserTurns));
      return;
    }

    if (incomingUserTurns.length === 0) {
      this.repository.upsertActiveTopicBuffer(this.extendTopicBuffer(buffer, record, incomingUserTurns));
      return;
    }

    const decision = await this.extractor.judgeTopicShift({
      currentTopicSummary: buffer.topicSummary,
      recentUserTurns: buffer.userTurns.slice(-8),
      incomingUserTurns,
    });

    if (decision.topicChanged) {
      await this.closeTopicBuffer(record.sessionKey, stats, `${reason}:topic_shift`);
      this.repository.upsertActiveTopicBuffer(this.createTopicBuffer(record, incomingUserTurns, decision.topicSummary));
      return;
    }

    this.repository.upsertActiveTopicBuffer(
      this.extendTopicBuffer(buffer, record, incomingUserTurns, decision.topicSummary),
    );
  }

  private async processPendingSession(records: L0SessionRecord[], stats: HeartbeatStats, reason: string): Promise<void> {
    if (records.length === 0) return;
    const sessionKey = records[0]!.sessionKey;
    await this.closeOtherSessionBuffers(sessionKey, stats, reason);

    const buffer = this.repository.getActiveTopicBuffer(sessionKey);
    if (!buffer) {
      const mergedTurns = records.flatMap((record) => userTurnsFromRecord(record));
      this.repository.upsertActiveTopicBuffer(this.createTopicBufferFromBatch(records, mergedTurns));
      return;
    }

    let scratch = buffer;
    let mergedIncomingTurns: string[] = [];
    for (const record of records) {
      const incomingUserTurns = extractIncomingUserTurns(record, scratch);
      if (incomingUserTurns.length > 0) {
        mergedIncomingTurns = mergeUniqueStrings(mergedIncomingTurns, incomingUserTurns);
      }
      scratch = this.extendTopicBuffer(scratch, record, incomingUserTurns);
    }

    if (mergedIncomingTurns.length === 0) {
      this.repository.upsertActiveTopicBuffer(scratch);
      return;
    }

    const decision = await this.extractor.judgeTopicShift({
      currentTopicSummary: buffer.topicSummary,
      recentUserTurns: buffer.userTurns.slice(-8),
      incomingUserTurns: mergedIncomingTurns,
    });

    if (decision.topicChanged) {
      await this.closeTopicBuffer(sessionKey, stats, `${reason}:topic_shift`);
      this.repository.upsertActiveTopicBuffer(
        this.createTopicBufferFromBatch(records, mergedIncomingTurns, decision.topicSummary),
      );
      return;
    }

    this.repository.upsertActiveTopicBuffer({
      ...scratch,
      topicSummary: decision.topicSummary?.trim() || scratch.topicSummary,
    });
  }

  async runHeartbeat(options: HeartbeatRunOptions = {}): Promise<HeartbeatStats> {
    const stats: HeartbeatStats = {
      l0Captured: 0,
      l1Created: 0,
      l2TimeUpdated: 0,
      l2ProjectUpdated: 0,
      profileUpdated: 0,
      failed: 0,
    };

    const batchSize = options.batchSize ?? this.batchSize;
    const sessionKeys = Array.isArray(options.sessionKeys) && options.sessionKeys.length > 0
      ? Array.from(new Set(options.sessionKeys))
      : undefined;
    const reason = options.reason ?? "heartbeat";

    while (true) {
      const pending = this.repository.listUnindexedL0Sessions(batchSize, sessionKeys);
      if (pending.length === 0) break;
      stats.l0Captured += pending.length;

      const indexedIds: string[] = [];
      const grouped = new Map<string, L0SessionRecord[]>();
      for (const record of pending) {
        const list = grouped.get(record.sessionKey) ?? [];
        list.push(record);
        grouped.set(record.sessionKey, list);
      }
      for (const records of grouped.values()) {
        try {
          await this.processPendingSession(records, stats, reason);
          indexedIds.push(...records.map((record) => record.l0IndexId));
        } catch (error) {
          stats.failed += 1;
          this.logger?.warn?.(
            `[youarememory] heartbeat failed reason=${reason} session=${records[0]?.sessionKey ?? "unknown"} l0=${records[0]?.l0IndexId ?? "unknown"}: ${String(error)}`,
          );
        }
      }

      this.repository.markL0Indexed(indexedIds);
      if (indexedIds.length === 0) break;
      if (pending.length < batchSize) break;
    }

    if (reason === "session_boundary" && sessionKeys && sessionKeys.length > 0) {
      for (const sessionKey of sessionKeys) {
        try {
          await this.closeTopicBuffer(sessionKey, stats, reason);
        } catch (error) {
          stats.failed += 1;
          this.logger?.warn?.(
            `[youarememory] close topic failed reason=${reason} session=${sessionKey}: ${String(error)}`,
          );
        }
      }
    }

    if (reason === "manual") {
      for (const buffer of this.repository.listActiveTopicBuffers()) {
        try {
          await this.closeTopicBuffer(buffer.sessionKey, stats, reason);
        } catch (error) {
          stats.failed += 1;
          this.logger?.warn?.(
            `[youarememory] close topic failed reason=${reason} session=${buffer.sessionKey}: ${String(error)}`,
          );
        }
      }
    }

    if (stats.l1Created > 0 || stats.l2TimeUpdated > 0 || stats.l2ProjectUpdated > 0 || stats.profileUpdated > 0) {
      this.repository.setPipelineState("lastIndexedAt", nowIso());
    }
    return stats;
  }
}
