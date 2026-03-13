export type ChatRole = "user" | "assistant" | "system" | string;

export interface MemoryMessage {
  msgId?: string;
  role: ChatRole;
  content: string;
}

export interface L0SessionRecord {
  l0IndexId: string;
  sessionKey: string;
  timestamp: string;
  messages: MemoryMessage[];
  source: string;
  indexed: boolean;
  createdAt: string;
}

export interface FactCandidate {
  factKey: string;
  factValue: string;
  confidence: number;
}

export type ProjectStatus = "planned" | "in_progress" | "blocked" | "on_hold" | "done" | "unknown";
export type L2TimeGranularity = "day" | "half_day" | "hour";
export type L1WindowMode = "time" | "count";

export interface IndexingSettings {
  autoIndexIntervalMinutes: number;
  l1WindowMode: L1WindowMode;
  l1WindowMinutes: number;
  l1WindowMaxL0: number;
  l2TimeGranularity: L2TimeGranularity;
}

export interface ProjectDetail {
  key: string;
  name: string;
  status: ProjectStatus;
  summary: string;
  latestProgress: string;
  confidence: number;
}

export interface L1WindowRecord {
  l1IndexId: string;
  sessionKey: string;
  timePeriod: string;
  startedAt: string;
  endedAt: string;
  summary: string;
  facts: FactCandidate[];
  situationTimeInfo: string;
  projectTags: string[];
  projectDetails: ProjectDetail[];
  l0Source: string[];
  createdAt: string;
}

export interface L2TimeIndexRecord {
  l2IndexId: string;
  dateKey: string;
  summary: string;
  l1Source: string[];
  createdAt: string;
  updatedAt: string;
}

export interface L2ProjectIndexRecord {
  l2IndexId: string;
  projectKey: string;
  projectName: string;
  summary: string;
  currentStatus: string;
  latestProgress: string;
  l1Source: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GlobalFactItem {
  factKey: string;
  factValue: string;
  confidence: number;
  sourceL1Ids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GlobalFactRecord {
  recordId: "global_fact_record";
  facts: GlobalFactItem[];
  createdAt: string;
  updatedAt: string;
}

export interface IndexLinkRecord {
  linkId: string;
  fromLevel: "l2" | "l1" | "l0";
  fromId: string;
  toLevel: "l2" | "l1" | "l0";
  toId: string;
  createdAt: string;
}

export type IntentType = "time" | "project" | "fact" | "general";

export type L2SearchResult =
  | {
      score: number;
      level: "l2_time";
      item: L2TimeIndexRecord;
    }
  | {
      score: number;
      level: "l2_project";
      item: L2ProjectIndexRecord;
    };

export interface L1SearchResult {
  score: number;
  item: L1WindowRecord;
}

export interface L0SearchResult {
  score: number;
  item: L0SessionRecord;
}

export interface RetrievalResult {
  query: string;
  intent: IntentType;
  enoughAt: "l2" | "l1" | "l0" | "none";
  l2Results: L2SearchResult[];
  l1Results: L1SearchResult[];
  l0Results: L0SearchResult[];
  context: string;
}

export interface DashboardOverview {
  totalL0: number;
  pendingL0: number;
  totalL1: number;
  totalL2Time: number;
  totalL2Project: number;
  totalFacts: number;
  lastIndexedAt?: string;
}

export interface MemoryUiSnapshot {
  overview: DashboardOverview;
  settings: IndexingSettings;
  recentTimeIndexes: L2TimeIndexRecord[];
  recentProjectIndexes: L2ProjectIndexRecord[];
  recentL1Windows: L1WindowRecord[];
  recentSessions: L0SessionRecord[];
  globalFact: GlobalFactRecord;
}
