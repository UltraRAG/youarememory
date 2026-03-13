import type { IndexingSettings, L0SessionRecord, MemoryMessage } from "../types.js";
import { buildL0IndexId, nowIso } from "../utils/id.js";
import { extractL1FromWindow } from "../indexers/l1-extractor.js";
import { buildL2ProjectsFromL1, buildL2TimeFromL1 } from "../indexers/l2-builder.js";
import { LlmMemoryExtractor } from "../skills/llm-extraction.js";
import { MemoryRepository } from "../storage/sqlite.js";

interface L0WindowGroup {
  sessionKey: string;
  records: L0SessionRecord[];
}

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
  factsUpdated: number;
  failed: number;
}

function sameMessage(left: MemoryMessage | undefined, right: MemoryMessage | undefined): boolean {
  if (!left || !right) return false;
  return left.role === right.role && left.content === right.content;
}

function buildWindowGroups(records: L0SessionRecord[], settings: IndexingSettings): L0WindowGroup[] {
  const bySession = new Map<string, L0SessionRecord[]>();
  for (const record of records) {
    const group = bySession.get(record.sessionKey) ?? [];
    group.push(record);
    bySession.set(record.sessionKey, group);
  }

  const groups: L0WindowGroup[] = [];
  for (const [sessionKey, items] of bySession.entries()) {
    const ordered = [...items].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    let current: L0SessionRecord[] = [];
    let windowStart = Number.NaN;

    for (const record of ordered) {
      const recordTime = new Date(record.timestamp).getTime();
      const overCount = settings.l1WindowMaxL0 > 0 && current.length >= settings.l1WindowMaxL0;
      const overTime = settings.l1WindowMinutes > 0
        && current.length > 0
        && Number.isFinite(windowStart)
        && Number.isFinite(recordTime)
        && recordTime - windowStart >= settings.l1WindowMinutes * 60_000;

      const shouldSplit = settings.l1WindowMode === "count" ? overCount : overTime;
      if (shouldSplit) {
        groups.push({ sessionKey, records: current });
        current = [];
        windowStart = Number.NaN;
      }

      if (current.length === 0) {
        windowStart = recordTime;
      }
      current.push(record);
    }

    if (current.length > 0) {
      groups.push({ sessionKey, records: current });
    }
  }

  return groups;
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

async function canonicalizeL1Projects(
  projects: Awaited<ReturnType<typeof extractL1FromWindow>>["projectDetails"],
  repository: MemoryRepository,
  extractor: LlmMemoryExtractor,
): Promise<Awaited<ReturnType<typeof extractL1FromWindow>>["projectDetails"]> {
  if (projects.length === 0) return projects;
  const existingProjects = repository.listRecentL2Projects(40);
  const resolved = [];
  for (const project of projects) {
    resolved.push(await extractor.resolveProjectIdentity({ project, existingProjects }));
  }
  const deduped = new Map<string, (typeof resolved)[number]>();
  for (const project of resolved) {
    if (!deduped.has(project.key)) {
      deduped.set(project.key, project);
    }
  }
  return Array.from(deduped.values());
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

  async runHeartbeat(options: HeartbeatRunOptions = {}): Promise<HeartbeatStats> {
    const stats: HeartbeatStats = {
      l0Captured: 0,
      l1Created: 0,
      l2TimeUpdated: 0,
      l2ProjectUpdated: 0,
      factsUpdated: 0,
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

      const groups = buildWindowGroups(pending, this.settings);
      const indexedIds: string[] = [];

      for (const group of groups) {
        try {
          const extracted = await extractL1FromWindow(group.records, this.extractor);
          const canonicalProjects = await canonicalizeL1Projects(extracted.projectDetails, this.repository, this.extractor);
          const l1 = {
            ...extracted,
            projectDetails: canonicalProjects,
            projectTags: canonicalProjects.map((project) => project.name),
          };
          this.repository.insertL1Window(l1);
          for (const l0 of group.records) {
            this.repository.insertLink("l1", l1.l1IndexId, "l0", l0.l0IndexId);
          }
          stats.l1Created += 1;

          const l2Time = buildL2TimeFromL1(l1, this.settings);
          this.repository.upsertL2TimeIndex(l2Time);
          this.repository.insertLink("l2", l2Time.l2IndexId, "l1", l1.l1IndexId);
          stats.l2TimeUpdated += 1;

          const projectIndexes = buildL2ProjectsFromL1(l1);
          for (const l2Project of projectIndexes) {
            this.repository.upsertL2ProjectIndex(l2Project);
            this.repository.insertLink("l2", l2Project.l2IndexId, "l1", l1.l1IndexId);
            stats.l2ProjectUpdated += 1;
          }

          this.repository.upsertGlobalFacts(l1.facts, l1.l1IndexId);
          stats.factsUpdated += l1.facts.length;
          indexedIds.push(...group.records.map((record) => record.l0IndexId));
        } catch (error) {
          stats.failed += 1;
          this.logger?.warn?.(
            `[youarememory] heartbeat failed reason=${reason} session=${group.sessionKey}: ${String(error)}`,
          );
        }
      }

      this.repository.markL0Indexed(indexedIds);
      if (indexedIds.length === 0) break;
      if (pending.length < batchSize) break;
    }

    if (stats.l1Created > 0 || stats.l2TimeUpdated > 0 || stats.l2ProjectUpdated > 0) {
      this.repository.setPipelineState("lastIndexedAt", nowIso());
    }
    return stats;
  }
}
