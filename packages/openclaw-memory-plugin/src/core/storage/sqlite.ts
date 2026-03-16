import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActiveTopicBufferRecord,
  DashboardOverview,
  FactCandidate,
  GlobalProfileRecord,
  IndexingSettings,
  L0SessionRecord,
  L1SearchResult,
  L1WindowRecord,
  L2ProjectIndexRecord,
  L2SearchResult,
  L2TimeIndexRecord,
  MemoryMessage,
  MemoryUiSnapshot,
} from "../types.js";
import { buildLinkId, nowIso } from "../utils/id.js";
import { safeJsonParse, scoreMatch } from "../utils/text.js";

type DbRow = Record<string, unknown>;
type SearchIdHit = { id: string; score: number };

const GLOBAL_PROFILE_RECORD_ID = "global_profile_record" as const;
const INDEXING_SETTINGS_STATE_KEY = "indexingSettings" as const;

export interface ClearMemoryResult {
  cleared: {
    l0: number;
    l1: number;
    l2Time: number;
    l2Project: number;
    profile: number;
    activeTopics: number;
    links: number;
    pipelineState: number;
  };
  clearedAt: string;
}

export interface RepairMemoryResult {
  inspected: number;
  updated: number;
  removed: number;
  rebuilt: boolean;
}

function parseL0Row(row: DbRow): L0SessionRecord {
  return {
    l0IndexId: String(row.l0_index_id),
    sessionKey: String(row.session_key),
    timestamp: String(row.timestamp),
    messages: safeJsonParse(String(row.messages_json ?? "[]"), []),
    source: String(row.source ?? "openclaw"),
    indexed: Number(row.indexed ?? 0) === 1,
    createdAt: String(row.created_at),
  };
}

function parseActiveTopicBufferRow(row: DbRow): ActiveTopicBufferRecord {
  return {
    sessionKey: String(row.session_key),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    topicSummary: String(row.topic_summary ?? ""),
    userTurns: safeJsonParse(String(row.user_turns_json ?? "[]"), []),
    l0Ids: safeJsonParse(String(row.l0_ids_json ?? "[]"), []),
    lastL0Id: String(row.last_l0_id ?? ""),
    createdAt: String(row.created_at),
  };
}

function parseL1Row(row: DbRow): L1WindowRecord {
  return {
    l1IndexId: String(row.l1_index_id),
    sessionKey: String(row.session_key ?? ""),
    timePeriod: String(row.time_period),
    startedAt: String(row.started_at ?? row.created_at),
    endedAt: String(row.ended_at ?? row.created_at),
    summary: String(row.summary),
    facts: safeJsonParse(String(row.facts_json ?? "[]"), []),
    situationTimeInfo: String(row.situation_time_info ?? ""),
    projectTags: safeJsonParse(String(row.project_tags_json ?? "[]"), []),
    projectDetails: safeJsonParse(String(row.project_details_json ?? "[]"), []),
    l0Source: safeJsonParse(String(row.l0_source_json ?? "[]"), []),
    createdAt: String(row.created_at),
  };
}

function parseL2TimeRow(row: DbRow): L2TimeIndexRecord {
  return {
    l2IndexId: String(row.l2_index_id),
    dateKey: String(row.date_key),
    summary: String(row.summary),
    l1Source: safeJsonParse(String(row.l1_source_json ?? "[]"), []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseL2ProjectRow(row: DbRow): L2ProjectIndexRecord {
  return {
    l2IndexId: String(row.l2_index_id),
    projectKey: String(row.project_key ?? row.project_name),
    projectName: String(row.project_name),
    summary: String(row.summary),
    currentStatus: String(row.current_status) as L2ProjectIndexRecord["currentStatus"],
    latestProgress: String(row.latest_progress),
    l1Source: safeJsonParse(String(row.l1_source_json ?? "[]"), []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseGlobalProfileRow(row: DbRow): GlobalProfileRecord {
  return {
    recordId: GLOBAL_PROFILE_RECORD_ID,
    profileText: String(row.profile_text ?? ""),
    sourceL1Ids: safeJsonParse(String(row.source_l1_ids_json ?? "[]"), []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mergeSourceIds(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

function tokenizeQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const tokens = new Set<string>();
  tokens.add(trimmed);
  for (const token of trimmed.split(/[\s,.;:!?，。！？、]+/g)) {
    const cleaned = token.trim();
    if (cleaned.length >= 2) tokens.add(cleaned);
  }
  return Array.from(tokens);
}

function computeTokenScore(query: string, candidates: string[]): number {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 1;
  let best = 0;
  for (const text of candidates) {
    for (const token of tokens) {
      best = Math.max(best, scoreMatch(token, text));
    }
  }
  return best;
}

function normalizeIndexingSettings(
  input: Partial<IndexingSettings> | undefined,
  defaults: IndexingSettings,
): IndexingSettings {
  const legacy = input as Record<string, unknown> | undefined;
  const reasoningMode = input?.reasoningMode === "accuracy_first" ? "accuracy_first" : "answer_first";
  const rawLatency = typeof input?.maxAutoReplyLatencyMs === "number" && Number.isFinite(input.maxAutoReplyLatencyMs)
    ? input.maxAutoReplyLatencyMs
    : typeof legacy?.recallBudgetMs === "number" && Number.isFinite(legacy.recallBudgetMs)
      ? legacy.recallBudgetMs
      : defaults.maxAutoReplyLatencyMs;
  return {
    reasoningMode,
    maxAutoReplyLatencyMs: Math.max(300, Math.floor(rawLatency)),
  };
}

export class MemoryRepository {
  private readonly db: DatabaseSync;
  private ftsEnabled = false;

  constructor(private readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA temp_store = MEMORY;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private hasColumn(tableName: string, columnName: string): boolean {
    const stmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
    const rows = stmt.all() as Array<{ name?: string }>;
    return rows.some((row) => row.name === columnName);
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    if (this.hasColumn(tableName, columnName)) return;
    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }

  private ensureGlobalProfileRecord(): void {
    const now = nowIso();
    const stmt = this.db.prepare(`
      INSERT INTO global_profile_record (
        record_id, profile_text, source_l1_ids_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(record_id) DO NOTHING
    `);
    stmt.run(GLOBAL_PROFILE_RECORD_ID, "", "[]", now, now);
  }

  private saveGlobalProfileRecord(record: GlobalProfileRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO global_profile_record (
        record_id, profile_text, source_l1_ids_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(record_id) DO UPDATE SET
        profile_text = excluded.profile_text,
        source_l1_ids_json = excluded.source_l1_ids_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      record.recordId,
      record.profileText,
      JSON.stringify(record.sourceL1Ids),
      record.createdAt,
      record.updatedAt,
    );
    this.syncProfileFts(record);
  }

  private initFts(): void {
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS global_profile_fts USING fts5(record_id UNINDEXED, content);
        CREATE VIRTUAL TABLE IF NOT EXISTS l2_time_fts USING fts5(l2_index_id UNINDEXED, content);
        CREATE VIRTUAL TABLE IF NOT EXISTS l2_project_fts USING fts5(l2_index_id UNINDEXED, content);
        CREATE VIRTUAL TABLE IF NOT EXISTS l1_window_fts USING fts5(l1_index_id UNINDEXED, content);
      `);
      this.ftsEnabled = true;
    } catch {
      this.ftsEnabled = false;
    }
  }

  private upsertFtsDocument(tableName: string, idColumn: string, id: string, content: string): void {
    if (!this.ftsEnabled || !id.trim()) return;
    const deleteStmt = this.db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`);
    const insertStmt = this.db.prepare(`INSERT INTO ${tableName} (${idColumn}, content) VALUES (?, ?)`);
    deleteStmt.run(id);
    insertStmt.run(id, content.trim());
  }

  private deleteFtsDocument(tableName: string, idColumn: string, id: string): void {
    if (!this.ftsEnabled || !id.trim()) return;
    const stmt = this.db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`);
    stmt.run(id);
  }

  private buildFtsQuery(query: string): string {
    const tokens = tokenizeQuery(query).slice(0, 8);
    if (tokens.length === 0) return "";
    return tokens
      .map((token) => `"${token.replace(/"/g, "\"\"")}"`)
      .join(" OR ");
  }

  private searchFts(tableName: string, idColumn: string, query: string, limit: number): SearchIdHit[] {
    if (!this.ftsEnabled) return [];
    const ftsQuery = this.buildFtsQuery(query);
    if (!ftsQuery) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT ${idColumn} AS id, bm25(${tableName}) AS rank
        FROM ${tableName}
        WHERE ${tableName} MATCH ?
        ORDER BY rank ASC
        LIMIT ?
      `);
      const rows = stmt.all(ftsQuery, limit) as Array<{ id?: string; rank?: number }>;
      return rows
        .filter((row) => typeof row.id === "string" && row.id.trim())
        .map((row, index) => ({
          id: String(row.id),
          score: Math.max(0.2, 1 - Math.min(6, index) * 0.12),
        }));
    } catch {
      return [];
    }
  }

  private syncProfileFts(profile: GlobalProfileRecord): void {
    this.upsertFtsDocument(
      "global_profile_fts",
      "record_id",
      profile.recordId,
      [profile.profileText, profile.sourceL1Ids.join(" ")].filter(Boolean).join("\n"),
    );
  }

  private syncL1Fts(window: L1WindowRecord): void {
    this.upsertFtsDocument(
      "l1_window_fts",
      "l1_index_id",
      window.l1IndexId,
      [
        window.sessionKey,
        window.timePeriod,
        window.summary,
        window.situationTimeInfo,
        window.projectTags.join(" "),
        window.projectDetails.map((project) => `${project.name} ${project.summary} ${project.latestProgress}`).join(" "),
        window.facts.map((fact) => `${fact.factKey} ${fact.factValue}`).join(" "),
      ].filter(Boolean).join("\n"),
    );
  }

  private syncL2TimeFts(index: L2TimeIndexRecord): void {
    this.upsertFtsDocument(
      "l2_time_fts",
      "l2_index_id",
      index.l2IndexId,
      [index.dateKey, index.summary, index.l1Source.join(" ")].filter(Boolean).join("\n"),
    );
  }

  private syncL2ProjectFts(index: L2ProjectIndexRecord): void {
    this.upsertFtsDocument(
      "l2_project_fts",
      "l2_index_id",
      index.l2IndexId,
      [
        index.projectKey,
        index.projectName,
        index.summary,
        index.latestProgress,
        index.currentStatus,
        index.l1Source.join(" "),
      ].filter(Boolean).join("\n"),
    );
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS l0_sessions (
        l0_index_id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        messages_json TEXT NOT NULL,
        source TEXT NOT NULL,
        indexed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS active_topic_buffers (
        session_key TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        topic_summary TEXT NOT NULL DEFAULT '',
        user_turns_json TEXT NOT NULL DEFAULT '[]',
        l0_ids_json TEXT NOT NULL DEFAULT '[]',
        last_l0_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS l1_windows (
        l1_index_id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL DEFAULT '',
        time_period TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT '',
        ended_at TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL,
        facts_json TEXT NOT NULL,
        situation_time_info TEXT NOT NULL,
        project_tags_json TEXT NOT NULL,
        project_details_json TEXT NOT NULL DEFAULT '[]',
        l0_source_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS l2_time_indexes (
        l2_index_id TEXT PRIMARY KEY,
        date_key TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        l1_source_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS l2_project_indexes (
        l2_index_id TEXT PRIMARY KEY,
        project_key TEXT NOT NULL DEFAULT '',
        project_name TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        current_status TEXT NOT NULL,
        latest_progress TEXT NOT NULL,
        l1_source_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS global_profile_record (
        record_id TEXT PRIMARY KEY,
        profile_text TEXT NOT NULL,
        source_l1_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS index_links (
        link_id TEXT PRIMARY KEY,
        from_level TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_level TEXT NOT NULL,
        to_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(from_level, from_id, to_level, to_id)
      );

      CREATE TABLE IF NOT EXISTS pipeline_state (
        state_key TEXT PRIMARY KEY,
        state_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_l0_session_time ON l0_sessions(session_key, timestamp);
      CREATE INDEX IF NOT EXISTS idx_l0_indexed ON l0_sessions(indexed, timestamp);
      CREATE INDEX IF NOT EXISTS idx_l1_time_period ON l1_windows(time_period);
      CREATE INDEX IF NOT EXISTS idx_l2_time_date ON l2_time_indexes(date_key);
      CREATE INDEX IF NOT EXISTS idx_l2_project_name ON l2_project_indexes(project_name);
      CREATE INDEX IF NOT EXISTS idx_l2_project_key ON l2_project_indexes(project_key);
      CREATE INDEX IF NOT EXISTS idx_active_topic_updated ON active_topic_buffers(updated_at);
    `);

    this.ensureColumn("l1_windows", "session_key", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("l1_windows", "started_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("l1_windows", "ended_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("l1_windows", "project_details_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("l2_project_indexes", "project_key", "TEXT NOT NULL DEFAULT ''");
    this.ensureGlobalProfileRecord();
    this.initFts();
    this.rebuildSearchIndexes();
  }

  private rebuildSearchIndexes(): void {
    if (!this.ftsEnabled) return;
    this.db.exec(`
      DELETE FROM global_profile_fts;
      DELETE FROM l2_time_fts;
      DELETE FROM l2_project_fts;
      DELETE FROM l1_window_fts;
    `);
    this.syncProfileFts(this.getGlobalProfileRecord());
    for (const item of this.listRecentL2Time(10_000)) this.syncL2TimeFts(item);
    for (const item of this.listRecentL2Projects(10_000)) this.syncL2ProjectFts(item);
    for (const item of this.listRecentL1(10_000)) this.syncL1Fts(item);
  }

  insertL0Session(record: Omit<L0SessionRecord, "createdAt"> & { createdAt?: string }): void {
    const createdAt = record.createdAt ?? nowIso();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO l0_sessions (
        l0_index_id, session_key, timestamp, messages_json, source, indexed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.l0IndexId,
      record.sessionKey,
      record.timestamp,
      JSON.stringify(record.messages),
      record.source,
      record.indexed ? 1 : 0,
      createdAt,
    );
  }

  listUnindexedL0Sessions(limit = 20, sessionKeys?: string[]): L0SessionRecord[] {
    const keys = Array.isArray(sessionKeys) ? sessionKeys.filter(Boolean) : [];
    const whereParts = ["indexed = 0"];
    const params: Array<string | number> = [];
    if (keys.length > 0) {
      whereParts.push(`session_key IN (${keys.map(() => "?").join(", ")})`);
      params.push(...keys);
    }
    const limitSql = Number.isFinite(limit) ? "LIMIT ?" : "";
    if (Number.isFinite(limit)) params.push(limit);
    const stmt = this.db.prepare(`
      SELECT * FROM l0_sessions
      WHERE ${whereParts.join(" AND ")}
      ORDER BY timestamp ASC
      ${limitSql}
    `);
    const rows = stmt.all(...params) as DbRow[];
    return rows.map(parseL0Row);
  }

  markL0Indexed(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = this.db.prepare(`UPDATE l0_sessions SET indexed = 1 WHERE l0_index_id IN (${placeholders})`);
    stmt.run(...ids);
  }

  getL0ByIds(ids: string[]): L0SessionRecord[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = this.db.prepare(`SELECT * FROM l0_sessions WHERE l0_index_id IN (${placeholders}) ORDER BY timestamp ASC`);
    const rows = stmt.all(...ids) as DbRow[];
    return rows.map(parseL0Row);
  }

  searchL0(query: string, limit = 8): L0SessionRecord[] {
    const rows = this.listRecentL0(Math.max(50, limit * 10));
    const scored = rows.map((item) => ({
      item,
      score: computeTokenScore(query, [item.sessionKey, JSON.stringify(item.messages)]),
    }));
    return scored
      .filter((hit) => hit.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((hit) => hit.item);
  }

  getL0ByL1Ids(l1Ids: string[], limit = 4): L0SessionRecord[] {
    if (l1Ids.length === 0) return [];
    const l1Rows = this.getL1ByIds(l1Ids);
    const l0Ids = Array.from(new Set(l1Rows.flatMap((item) => item.l0Source))).slice(0, limit * 3);
    return this.getL0ByIds(l0Ids).slice(0, limit);
  }

  listRecentL0(limit = 20): L0SessionRecord[] {
    const stmt = this.db.prepare("SELECT * FROM l0_sessions ORDER BY timestamp DESC LIMIT ?");
    const rows = stmt.all(limit) as DbRow[];
    return rows.map(parseL0Row);
  }

  listAllL0(): L0SessionRecord[] {
    const stmt = this.db.prepare("SELECT * FROM l0_sessions ORDER BY timestamp ASC");
    const rows = stmt.all() as DbRow[];
    return rows.map(parseL0Row);
  }

  getActiveTopicBuffer(sessionKey: string): ActiveTopicBufferRecord | undefined {
    const stmt = this.db.prepare("SELECT * FROM active_topic_buffers WHERE session_key = ?");
    const row = stmt.get(sessionKey) as DbRow | undefined;
    return row ? parseActiveTopicBufferRow(row) : undefined;
  }

  listActiveTopicBuffers(sessionKeys?: string[]): ActiveTopicBufferRecord[] {
    const keys = Array.isArray(sessionKeys) ? sessionKeys.filter(Boolean) : [];
    if (keys.length === 0) {
      const stmt = this.db.prepare("SELECT * FROM active_topic_buffers ORDER BY updated_at DESC");
      return (stmt.all() as DbRow[]).map(parseActiveTopicBufferRow);
    }
    const placeholders = keys.map(() => "?").join(", ");
    const stmt = this.db.prepare(`
      SELECT * FROM active_topic_buffers
      WHERE session_key IN (${placeholders})
      ORDER BY updated_at DESC
    `);
    return (stmt.all(...keys) as DbRow[]).map(parseActiveTopicBufferRow);
  }

  upsertActiveTopicBuffer(buffer: ActiveTopicBufferRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO active_topic_buffers (
        session_key, started_at, updated_at, topic_summary, user_turns_json, l0_ids_json, last_l0_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        topic_summary = excluded.topic_summary,
        user_turns_json = excluded.user_turns_json,
        l0_ids_json = excluded.l0_ids_json,
        last_l0_id = excluded.last_l0_id,
        created_at = excluded.created_at
    `);
    stmt.run(
      buffer.sessionKey,
      buffer.startedAt,
      buffer.updatedAt,
      buffer.topicSummary,
      JSON.stringify(buffer.userTurns),
      JSON.stringify(buffer.l0Ids),
      buffer.lastL0Id,
      buffer.createdAt,
    );
  }

  deleteActiveTopicBuffer(sessionKey: string): void {
    const stmt = this.db.prepare("DELETE FROM active_topic_buffers WHERE session_key = ?");
    stmt.run(sessionKey);
  }

  insertL1Window(window: L1WindowRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO l1_windows (
        l1_index_id, session_key, time_period, started_at, ended_at, summary, facts_json, situation_time_info, project_tags_json, project_details_json, l0_source_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      window.l1IndexId,
      window.sessionKey,
      window.timePeriod,
      window.startedAt,
      window.endedAt,
      window.summary,
      JSON.stringify(window.facts),
      window.situationTimeInfo,
      JSON.stringify(window.projectTags),
      JSON.stringify(window.projectDetails),
      JSON.stringify(window.l0Source),
      window.createdAt,
    );
    this.syncL1Fts(window);
  }

  getL1ByIds(ids: string[]): L1WindowRecord[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = this.db.prepare(`SELECT * FROM l1_windows WHERE l1_index_id IN (${placeholders}) ORDER BY created_at DESC`);
    const rows = stmt.all(...ids) as DbRow[];
    return rows.map(parseL1Row);
  }

  searchL1(query: string, limit = 10): L1WindowRecord[] {
    return this.searchL1Hits(query, limit).map((hit) => hit.item);
  }

  listRecentL1(limit = 20): L1WindowRecord[] {
    const stmt = this.db.prepare("SELECT * FROM l1_windows ORDER BY ended_at DESC, created_at DESC LIMIT ?");
    const rows = stmt.all(limit) as DbRow[];
    return rows.map(parseL1Row);
  }

  searchL1Hits(query: string, limit = 10): L1SearchResult[] {
    const recent = this.listRecentL1(Math.max(60, limit * 10));
    const ftsHits = this.searchFts("l1_window_fts", "l1_index_id", query, limit * 2);
    const ftsById = new Map(ftsHits.map((hit) => [hit.id, hit.score]));
    const scored = recent.map((item) => ({
      item,
      score: Math.max(
        ftsById.get(item.l1IndexId) ?? 0,
        computeTokenScore(query, [
          item.sessionKey,
          item.timePeriod,
          item.summary,
          item.situationTimeInfo,
          item.projectTags.join(" "),
          item.projectDetails.map((project) => `${project.name} ${project.summary} ${project.latestProgress}`).join(" "),
          JSON.stringify(item.facts),
        ]),
      ),
    }));
    return scored
      .filter((hit) => hit.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  getL2TimeByDate(dateKey: string): L2TimeIndexRecord | undefined {
    const stmt = this.db.prepare("SELECT * FROM l2_time_indexes WHERE date_key = ?");
    const row = stmt.get(dateKey) as DbRow | undefined;
    return row ? parseL2TimeRow(row) : undefined;
  }

  getL2TimeByIds(ids: string[]): L2TimeIndexRecord[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = this.db.prepare(`SELECT * FROM l2_time_indexes WHERE l2_index_id IN (${placeholders}) ORDER BY updated_at DESC`);
    const rows = stmt.all(...ids) as DbRow[];
    return rows.map(parseL2TimeRow);
  }

  upsertL2TimeIndex(index: L2TimeIndexRecord): void {
    const previous = this.getL2TimeByDate(index.dateKey);
    const now = nowIso();
    const mergedSources = mergeSourceIds(previous?.l1Source ?? [], index.l1Source);
    if (previous) {
      const updateStmt = this.db.prepare(`
        UPDATE l2_time_indexes
        SET summary = ?, l1_source_json = ?, updated_at = ?
        WHERE l2_index_id = ?
      `);
      updateStmt.run(index.summary, JSON.stringify(mergedSources), now, previous.l2IndexId);
      this.syncL2TimeFts({
        ...previous,
        summary: index.summary,
        l1Source: mergedSources,
        updatedAt: now,
      });
      return;
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO l2_time_indexes (
        l2_index_id, date_key, summary, l1_source_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      index.l2IndexId,
      index.dateKey,
      index.summary,
      JSON.stringify(mergedSources),
      index.createdAt,
      now,
    );
    this.syncL2TimeFts({
      ...index,
      l1Source: mergedSources,
      updatedAt: now,
    });
  }

  searchL2TimeIndexes(query: string, limit = 10): L2SearchResult[] {
    return this.searchL2Hits(query, limit).filter((hit) => hit.level === "l2_time");
  }

  listRecentL2Time(limit = 20): L2TimeIndexRecord[] {
    const stmt = this.db.prepare("SELECT * FROM l2_time_indexes ORDER BY updated_at DESC LIMIT ?");
    const rows = stmt.all(limit) as DbRow[];
    return rows.map(parseL2TimeRow);
  }

  getL2ProjectByKey(projectKey: string): L2ProjectIndexRecord | undefined {
    const stmt = this.db.prepare("SELECT * FROM l2_project_indexes WHERE project_key = ?");
    const row = stmt.get(projectKey) as DbRow | undefined;
    return row ? parseL2ProjectRow(row) : undefined;
  }

  getL2ProjectByIds(ids: string[]): L2ProjectIndexRecord[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = this.db.prepare(`SELECT * FROM l2_project_indexes WHERE l2_index_id IN (${placeholders}) ORDER BY updated_at DESC`);
    const rows = stmt.all(...ids) as DbRow[];
    return rows.map(parseL2ProjectRow);
  }

  upsertL2ProjectIndex(index: L2ProjectIndexRecord): void {
    const previous = this.getL2ProjectByKey(index.projectKey);
    const now = nowIso();
    const mergedSources = mergeSourceIds(previous?.l1Source ?? [], index.l1Source);
    if (previous) {
      const updateStmt = this.db.prepare(`
        UPDATE l2_project_indexes
        SET project_name = ?, summary = ?, current_status = ?, latest_progress = ?, l1_source_json = ?, updated_at = ?
        WHERE l2_index_id = ?
      `);
      updateStmt.run(
        index.projectName,
        index.summary,
        index.currentStatus,
        index.latestProgress,
        JSON.stringify(mergedSources),
        now,
        previous.l2IndexId,
      );
      this.syncL2ProjectFts({
        ...previous,
        projectName: index.projectName,
        summary: index.summary,
        currentStatus: index.currentStatus,
        latestProgress: index.latestProgress,
        l1Source: mergedSources,
        updatedAt: now,
      });
      return;
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO l2_project_indexes (
        l2_index_id, project_key, project_name, summary, current_status, latest_progress, l1_source_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      index.l2IndexId,
      index.projectKey,
      index.projectName,
      index.summary,
      index.currentStatus,
      index.latestProgress,
      JSON.stringify(mergedSources),
      index.createdAt,
      now,
    );
    this.syncL2ProjectFts({
      ...index,
      l1Source: mergedSources,
      updatedAt: now,
    });
  }

  searchL2ProjectIndexes(query: string, limit = 10): L2SearchResult[] {
    return this.searchL2Hits(query, limit).filter((hit) => hit.level === "l2_project");
  }

  listRecentL2Projects(limit = 20): L2ProjectIndexRecord[] {
    const stmt = this.db.prepare("SELECT * FROM l2_project_indexes ORDER BY updated_at DESC LIMIT ?");
    const rows = stmt.all(limit) as DbRow[];
    return rows.map(parseL2ProjectRow);
  }

  searchL2Hits(query: string, limit = 10): L2SearchResult[] {
    const recentTime = this.listRecentL2Time(Math.max(50, limit * 8));
    const recentProject = this.listRecentL2Projects(Math.max(50, limit * 8));
    const timeFts = new Map(this.searchFts("l2_time_fts", "l2_index_id", query, limit * 2).map((hit) => [hit.id, hit.score]));
    const projectFts = new Map(this.searchFts("l2_project_fts", "l2_index_id", query, limit * 2).map((hit) => [hit.id, hit.score]));
    const timeHits = recentTime.map((item) => ({
      level: "l2_time" as const,
      score: Math.max(timeFts.get(item.l2IndexId) ?? 0, computeTokenScore(query, [item.dateKey, item.summary])),
      item,
    }));
    const projectHits = recentProject.map((item) => ({
      level: "l2_project" as const,
      score: Math.max(
        projectFts.get(item.l2IndexId) ?? 0,
        computeTokenScore(query, [item.projectKey, item.projectName, item.summary, item.latestProgress]),
      ),
      item,
    }));
    const combined = [...timeHits, ...projectHits]
      .filter((hit) => hit.score > 0.12)
      .sort((a, b) => b.score - a.score);
    return combined.slice(0, limit);
  }

  getGlobalProfileRecord(): GlobalProfileRecord {
    this.ensureGlobalProfileRecord();
    const stmt = this.db.prepare("SELECT * FROM global_profile_record WHERE record_id = ?");
    const row = stmt.get(GLOBAL_PROFILE_RECORD_ID) as DbRow | undefined;
    if (row) return parseGlobalProfileRow(row);
    const now = nowIso();
    return {
      recordId: GLOBAL_PROFILE_RECORD_ID,
      profileText: "",
      sourceL1Ids: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  upsertGlobalProfile(profileText: string, sourceL1Ids: string[]): GlobalProfileRecord {
    const current = this.getGlobalProfileRecord();
    const now = nowIso();
    const next: GlobalProfileRecord = {
      recordId: GLOBAL_PROFILE_RECORD_ID,
      profileText: profileText.trim(),
      sourceL1Ids: mergeSourceIds(current.sourceL1Ids, sourceL1Ids),
      createdAt: current.createdAt,
      updatedAt: now,
    };
    this.saveGlobalProfileRecord(next);
    this.syncProfileFts(next);
    return next;
  }

  appendToGlobalProfile(content: string): GlobalProfileRecord {
    const current = this.getGlobalProfileRecord();
    const nextText = [current.profileText, content.trim()].filter(Boolean).join("\n");
    return this.upsertGlobalProfile(nextText, []);
  }

  searchGlobalProfile(query: string, limit = 1): GlobalProfileRecord[] {
    const profile = this.getGlobalProfileRecord();
    if (!profile.profileText.trim()) return [];
    if (!query.trim()) return [profile].slice(0, limit);
    const score = computeTokenScore(query, [profile.profileText, profile.sourceL1Ids.join(" ")]);
    return score > 0.15 ? [profile].slice(0, limit) : [];
  }

  shortlistGlobalProfile(query: string): { item: GlobalProfileRecord; score: number } | null {
    const profile = this.getGlobalProfileRecord();
    if (!profile.profileText.trim()) return null;
    const ftsScore = this.searchFts("global_profile_fts", "record_id", query, 1)[0]?.score ?? 0;
    const score = Math.max(ftsScore, computeTokenScore(query, [profile.profileText, profile.sourceL1Ids.join(" ")]));
    if (query.trim() && score <= 0.1) return null;
    return { item: profile, score: Math.max(score, query.trim() ? score : 0.2) };
  }

  getSnapshotVersion(): string {
    const overview = this.getOverview();
    return JSON.stringify({
      lastIndexedAt: overview.lastIndexedAt ?? "",
      totalL1: overview.totalL1,
      totalL2Time: overview.totalL2Time,
      totalL2Project: overview.totalL2Project,
      totalProfiles: overview.totalProfiles,
    });
  }

  insertLink(fromLevel: "l2" | "l1" | "l0", fromId: string, toLevel: "l2" | "l1" | "l0", toId: string): void {
    const linkId = buildLinkId(fromLevel, fromId, toLevel, toId);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO index_links (link_id, from_level, from_id, to_level, to_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(linkId, fromLevel, fromId, toLevel, toId, nowIso());
  }

  getOverview(): DashboardOverview {
    const count = (tableName: string): number => {
      const stmt = this.db.prepare(`SELECT COUNT(1) AS total FROM ${tableName}`);
      const row = stmt.get() as { total?: number } | undefined;
      return Number(row?.total ?? 0);
    };
    const stateStmt = this.db.prepare("SELECT state_value FROM pipeline_state WHERE state_key = ?");
    const state = stateStmt.get("lastIndexedAt") as { state_value?: string } | undefined;
    const profile = this.getGlobalProfileRecord();
    const overview: DashboardOverview = {
      totalL0: count("l0_sessions"),
      pendingL0: (() => {
        const stmt = this.db.prepare("SELECT COUNT(1) AS total FROM l0_sessions WHERE indexed = 0");
        const row = stmt.get() as { total?: number } | undefined;
        return Number(row?.total ?? 0);
      })(),
      openTopics: count("active_topic_buffers"),
      totalL1: count("l1_windows"),
      totalL2Time: count("l2_time_indexes"),
      totalL2Project: count("l2_project_indexes"),
      totalProfiles: profile.profileText.trim() ? 1 : 0,
      queuedSessions: 0,
      lastRecallMs: 0,
      recallTimeouts: 0,
      lastRecallMode: "none",
    };
    if (state?.state_value) {
      overview.lastIndexedAt = state.state_value;
    }
    return overview;
  }

  setPipelineState(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO pipeline_state (state_key, state_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = excluded.updated_at
    `);
    const now = nowIso();
    stmt.run(key, value, now);
  }

  getPipelineState(key: string): string | undefined {
    const stmt = this.db.prepare("SELECT state_value FROM pipeline_state WHERE state_key = ?");
    const row = stmt.get(key) as { state_value?: string } | undefined;
    return row?.state_value;
  }

  getIndexingSettings(defaults: IndexingSettings): IndexingSettings {
    const raw = this.getPipelineState(INDEXING_SETTINGS_STATE_KEY);
    if (!raw) return normalizeIndexingSettings(undefined, defaults);
    const parsed = safeJsonParse<Partial<IndexingSettings>>(raw, {});
    return normalizeIndexingSettings(parsed, defaults);
  }

  saveIndexingSettings(input: Partial<IndexingSettings>, defaults: IndexingSettings): IndexingSettings {
    const next = normalizeIndexingSettings(input, defaults);
    this.setPipelineState(INDEXING_SETTINGS_STATE_KEY, JSON.stringify(next));
    return next;
  }

  resetDerivedIndexes(): void {
    const currentProfile = this.getGlobalProfileRecord();
    this.db.exec("BEGIN");
    try {
      this.db.exec(`
        DELETE FROM active_topic_buffers;
        DELETE FROM index_links;
        DELETE FROM l2_project_indexes;
        DELETE FROM l2_time_indexes;
        DELETE FROM l1_windows;
        UPDATE l0_sessions SET indexed = 0;
      `);
      const clearLastIndexedStmt = this.db.prepare(`DELETE FROM pipeline_state WHERE state_key = ?`);
      clearLastIndexedStmt.run("lastIndexedAt");
      this.saveGlobalProfileRecord({
        recordId: GLOBAL_PROFILE_RECORD_ID,
        profileText: "",
        sourceL1Ids: [],
        createdAt: currentProfile.createdAt,
        updatedAt: nowIso(),
      });
      this.db.exec("COMMIT");
      this.rebuildSearchIndexes();
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  repairL0Sessions(
    cleaner: (record: L0SessionRecord) => MemoryMessage[],
  ): RepairMemoryResult {
    const rows = this.listAllL0();
    const stats: RepairMemoryResult = {
      inspected: rows.length,
      updated: 0,
      removed: 0,
      rebuilt: false,
    };
    if (rows.length === 0) return stats;

    const updateStmt = this.db.prepare(`
      UPDATE l0_sessions
      SET messages_json = ?, indexed = 0
      WHERE l0_index_id = ?
    `);
    const deleteStmt = this.db.prepare(`DELETE FROM l0_sessions WHERE l0_index_id = ?`);

    this.db.exec("BEGIN");
    try {
      for (const row of rows) {
        const cleaned = cleaner(row);
        if (cleaned.length === 0) {
          deleteStmt.run(row.l0IndexId);
          stats.removed += 1;
          continue;
        }

        const previousJson = JSON.stringify(row.messages);
        const nextJson = JSON.stringify(cleaned);
        if (previousJson !== nextJson) {
          updateStmt.run(nextJson, row.l0IndexId);
          stats.updated += 1;
        }
      }

      if (stats.updated > 0 || stats.removed > 0) {
        this.db.exec(`
          DELETE FROM active_topic_buffers;
          DELETE FROM index_links;
          DELETE FROM l2_project_indexes;
          DELETE FROM l2_time_indexes;
          DELETE FROM l1_windows;
          UPDATE l0_sessions SET indexed = 0;
        `);
        const clearLastIndexedStmt = this.db.prepare(`DELETE FROM pipeline_state WHERE state_key = ?`);
        clearLastIndexedStmt.run("lastIndexedAt");
        const currentProfile = this.getGlobalProfileRecord();
        this.saveGlobalProfileRecord({
          recordId: GLOBAL_PROFILE_RECORD_ID,
          profileText: "",
          sourceL1Ids: [],
          createdAt: currentProfile.createdAt,
          updatedAt: nowIso(),
        });
        stats.rebuilt = true;
      }

      this.db.exec("COMMIT");
      if (stats.rebuilt) this.rebuildSearchIndexes();
      return stats;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  clearAllMemoryData(): ClearMemoryResult {
    const runDelete = (table: string): number => {
      const stmt = this.db.prepare(`DELETE FROM ${table}`);
      const result = stmt.run() as { changes?: number };
      return Number(result.changes ?? 0);
    };

    const profileCount = this.getGlobalProfileRecord().profileText.trim() ? 1 : 0;
    const indexingSettings = this.getPipelineState(INDEXING_SETTINGS_STATE_KEY);
    this.db.exec("BEGIN");
    try {
      const cleared = {
        activeTopics: runDelete("active_topic_buffers"),
        links: runDelete("index_links"),
        l2Project: runDelete("l2_project_indexes"),
        l2Time: runDelete("l2_time_indexes"),
        l1: runDelete("l1_windows"),
        l0: runDelete("l0_sessions"),
        profile: profileCount,
        pipelineState: runDelete("pipeline_state"),
      };
      runDelete("global_profile_record");
      const resetAt = nowIso();
      this.saveGlobalProfileRecord({
        recordId: GLOBAL_PROFILE_RECORD_ID,
        profileText: "",
        sourceL1Ids: [],
        createdAt: resetAt,
        updatedAt: resetAt,
      });
      if (indexingSettings) {
        this.setPipelineState(INDEXING_SETTINGS_STATE_KEY, indexingSettings);
      }
      this.db.exec("COMMIT");
      this.rebuildSearchIndexes();
      return {
        cleared,
        clearedAt: resetAt,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getUiSnapshot(limit = 20): MemoryUiSnapshot {
    return {
      overview: this.getOverview(),
      settings: this.getIndexingSettings({
        reasoningMode: "answer_first",
        maxAutoReplyLatencyMs: 1800,
      }),
      recentTimeIndexes: this.listRecentL2Time(limit),
      recentProjectIndexes: this.listRecentL2Projects(limit),
      recentL1Windows: this.listRecentL1(limit),
      recentSessions: this.listRecentL0(limit),
      globalProfile: this.getGlobalProfileRecord(),
    };
  }
}
