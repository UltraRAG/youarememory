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

export interface L1WindowRecord {
  l1IndexId: string;
  timePeriod: string;
  summary: string;
  facts: FactCandidate[];
  situationTimeInfo: string;
  projectTags: string[];
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
  projectName: string;
  summary: string;
  currentStatus: string;
  latestProgress: string;
  l1Source: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GlobalFactRecord {
  factId: string;
  factKey: string;
  factValue: string;
  confidence: number;
  sourceL1Id?: string;
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
  totalL1: number;
  totalL2Time: number;
  totalL2Project: number;
  totalFacts: number;
  lastIndexedAt?: string;
}

export interface MemoryUiSnapshot {
  overview: DashboardOverview;
  recentTimeIndexes: L2TimeIndexRecord[];
  recentProjectIndexes: L2ProjectIndexRecord[];
  recentFacts: GlobalFactRecord[];
  recentSessions: L0SessionRecord[];
}
