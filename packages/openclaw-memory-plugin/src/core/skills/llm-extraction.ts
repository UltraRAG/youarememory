import type {
  FactCandidate,
  GlobalProfileRecord,
  IntentType,
  L0SessionRecord,
  L1WindowRecord,
  L2ProjectIndexRecord,
  L2TimeIndexRecord,
  MemoryMessage,
  ProjectDetail,
  ProjectStatus,
  RetrievalResult,
} from "../types.js";

type LoggerLike = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

type ProviderHeaders = Record<string, string> | undefined;

interface ModelSelection {
  provider: string;
  model: string;
  api: string;
  baseUrl?: string;
  headers?: ProviderHeaders;
}

interface RawFactItem {
  category?: unknown;
  subject?: unknown;
  value?: unknown;
  confidence?: unknown;
}

interface RawProjectItem {
  key?: unknown;
  name?: unknown;
  status?: unknown;
  summary?: unknown;
  latest_progress?: unknown;
  confidence?: unknown;
}

interface RawExtractionPayload {
  summary?: unknown;
  situation_time_info?: unknown;
  facts?: unknown;
  projects?: unknown;
}

interface RawProjectResolutionPayload {
  matched_project_key?: unknown;
  canonical_key?: unknown;
  canonical_name?: unknown;
}

interface RawTopicShiftPayload {
  topic_changed?: unknown;
  topic_summary?: unknown;
}

interface RawDailySummaryPayload {
  summary?: unknown;
}

interface RawProfilePayload {
  profile_text?: unknown;
}

interface RawReasoningPayload {
  intent?: unknown;
  enough_at?: unknown;
  use_profile?: unknown;
  l2_ids?: unknown;
  l1_ids?: unknown;
  l0_ids?: unknown;
}

export interface SessionExtractionResult {
  summary: string;
  situationTimeInfo: string;
  facts: FactCandidate[];
  projectDetails: ProjectDetail[];
}

export interface LlmProjectResolutionInput {
  project: ProjectDetail;
  existingProjects: L2ProjectIndexRecord[];
  agentId?: string;
}

export interface LlmTopicShiftInput {
  currentTopicSummary: string;
  recentUserTurns: string[];
  incomingUserTurns: string[];
  agentId?: string;
}

export interface LlmTopicShiftDecision {
  topicChanged: boolean;
  topicSummary: string;
}

export interface LlmDailyTimeSummaryInput {
  dateKey: string;
  existingSummary: string;
  l1: L1WindowRecord;
  agentId?: string;
}

export interface LlmGlobalProfileInput {
  existingProfile: string;
  l1: L1WindowRecord;
  agentId?: string;
}

export interface LlmReasoningInput {
  query: string;
  profile: GlobalProfileRecord | null;
  l2Time: L2TimeIndexRecord[];
  l2Projects: L2ProjectIndexRecord[];
  l1Windows: L1WindowRecord[];
  l0Sessions: L0SessionRecord[];
  limits: {
    l2: number;
    l1: number;
    l0: number;
  };
  agentId?: string;
}

export interface LlmReasoningSelection {
  intent: IntentType;
  enoughAt: RetrievalResult["enoughAt"];
  useProfile: boolean;
  l2Ids: string[];
  l1Ids: string[];
  l0Ids: string[];
}

const EXTRACTION_SYSTEM_PROMPT = `
You are a memory indexing engine for a conversational assistant.

Your job is to convert a visible user/assistant conversation into durable memory indexes.

Rules:
- Only use information explicitly present in the conversation.
- Ignore system prompts, tool scaffolding, hidden reasoning, formatting artifacts, and operational chatter.
- Be conservative. If something is ambiguous, omit it.
- Track projects only when they look like a real ongoing effort, task stream, research topic, implementation effort, or recurring problem worth revisiting later.
- "Project" here is broad: it can be a workstream, submission, research effort, health/problem thread, or other ongoing topic the user is likely to revisit.
- If the conversation contains multiple independent ongoing threads, return multiple project items instead of collapsing them into one.
- Repeated caregiving, illness handling, symptom tracking, recovery follow-up, or other ongoing real-world problem-solving threads should be treated as projects when the user is actively managing them.
- Example: "friend has diarrhea / user buys medicine / later reports recovery" is a project-like thread.
- Example: "preparing an EMNLP submission" is another independent project-like thread.
- Do not treat casual one-off mentions as projects.
- Extract facts only when they are likely to matter in future conversations: preferences, constraints, goals, identity, long-lived context, stable relationships, or durable project context.
- The facts are intermediate material for a later global profile rewrite, so prefer stable facts over temporary situation notes.
- Natural-language output fields must use the dominant language of the user messages. If user messages are mixed, prefer the most recent user language. Keys and enums must stay in English.
- Return valid JSON only. No markdown fences, no commentary.

Use this exact JSON shape:
{
  "summary": "short session summary",
  "situation_time_info": "short time-aware progress line",
  "facts": [
    {
      "category": "preference | profile | goal | constraint | relationship | project | context | other",
      "subject": "stable english key fragment",
      "value": "durable fact text",
      "confidence": 0.0
    }
  ],
  "projects": [
    {
      "key": "stable english identifier, lower-kebab-case",
      "name": "project name as the user would recognize it",
      "status": "planned | in_progress | blocked | on_hold | done | unknown",
      "summary": "short project summary",
      "latest_progress": "latest meaningful progress or state",
      "confidence": 0.0
    }
  ]
}
`.trim();

const PROJECT_RESOLUTION_SYSTEM_PROMPT = `
You resolve whether an incoming project memory should merge into an existing project memory.

Rules:
- Prefer merging duplicates caused by wording differences, synonyms, or different granularity of the same effort.
- Match only when the underlying ongoing effort is clearly the same.
- Reuse an existing project when possible.
- If multiple labels refer to the same EMNLP submission, the same health follow-up, or the same long-running effort, merge them.
- Return JSON only.

Use this exact JSON shape:
{
  "matched_project_key": "existing project key or null",
  "canonical_key": "stable lower-kebab-case key",
  "canonical_name": "project name users would recognize"
}
`.trim();

const PROJECT_COMPLETION_SYSTEM_PROMPT = `
You review an extracted project list and complete any missing ongoing threads from the conversation.

Rules:
- Return the full corrected project list, not just additions.
- Include all independent ongoing threads that are likely to matter in future conversation.
- Health/caregiving/problem-management threads count as projects when the user is actively managing them.
- Resolved but substantial threads from the current window may still be kept with status "done" if they are a meaningful thread the user may refer back to.
- Example pair of separate projects in one window: "friend's stomach illness and medicine follow-up" plus "EMNLP submission preparation".
- Merge duplicates caused by wording differences.
- Return JSON only.

Use this exact JSON shape:
{
  "projects": [
    {
      "key": "stable english identifier, lower-kebab-case",
      "name": "project name as the user would recognize it",
      "status": "planned | in_progress | blocked | on_hold | done | unknown",
      "summary": "short project summary",
      "latest_progress": "latest meaningful progress or state",
      "confidence": 0.0
    }
  ]
}
`.trim();

const TOPIC_BOUNDARY_SYSTEM_PROMPT = `
You judge whether new user messages continue the current topic or start a new topic.

Rules:
- Use only semantic meaning, not keyword overlap.
- Treat a topic as the same if the user is still talking about the same underlying problem, project, situation, or intent.
- Treat it as changed only when the new user messages clearly pivot to a different underlying topic.
- You are given only user messages. Do not assume any assistant content.
- Return JSON only.

Use this exact JSON shape:
{
  "topic_changed": true,
  "topic_summary": "short topic summary in the user's language"
}
`.trim();

const DAILY_TIME_SUMMARY_SYSTEM_PROMPT = `
You maintain a single daily episodic memory summary for a user.

Rules:
- Focus on what happened during that day, what the user was dealing with, and the day's situation.
- Do not turn the summary into a long-term profile.
- Do not over-focus on project metadata; describe the day's lived context.
- Merge the existing daily summary with the new L1 window into one concise updated daily summary.
- Natural-language output must follow the language used by the user in the new L1 window.
- Return JSON only.

Use this exact JSON shape:
{
  "summary": "updated daily summary"
}
`.trim();

const GLOBAL_PROFILE_SYSTEM_PROMPT = `
You maintain a single global user profile summary.

Rules:
- Rewrite the whole profile as one concise paragraph.
- Keep only stable user traits, identity, long-term preferences, constraints, relationships, communication style, and long-range goals.
- Do not include temporary daily events, short-lived situations, or project progress updates.
- Use the existing profile plus the new L1 facts as evidence, then rewrite the full profile.
- Natural-language output must follow the user's dominant language in the new L1 window.
- Return JSON only.

Use this exact JSON shape:
{
  "profile_text": "updated stable user profile paragraph"
}
`.trim();

const REASONING_SYSTEM_PROMPT = `
You are a semantic memory retrieval reasoner.

Your job is to decide which memory records are relevant to the user's query.

Rules:
- Use semantic meaning, not keyword overlap.
- Use high recall for obvious paraphrases and near-synonyms.
- Temporal summary questions like "我今天都在忙什么", "今天发生了什么", "我最近在做什么", "what was I doing today", or "what happened recently" should usually select L2 time indexes.
- If there is a current-day or recent-day L2 time summary and the user asks about today/recent activity, prefer that L2 time record even if wording differs.
- For project queries, prefer L2 project indexes when they already capture enough.
- For time queries, prefer L2 time indexes when they already capture enough.
- For profile/fact queries about the user's identity, preferences, habits, or stable traits, set use_profile=true when the global profile is useful.
- Select the smallest set of records needed to answer the query well.
- enough_at only refers to L2/L1/L0 structured memory. The profile is an additional supporting source.
- If L2 already captures enough, set enough_at to "l2".
- If L2 is insufficient but L1 is enough, set enough_at to "l1".
- If detailed raw conversation is needed, set enough_at to "l0".
- Return JSON only.

Use this exact JSON shape:
{
  "intent": "time | project | fact | general",
  "enough_at": "l2 | l1 | l0 | none",
  "use_profile": true,
  "l2_ids": ["l2 index id"],
  "l1_ids": ["l1 index id"],
  "l0_ids": ["l0 index id"]
}
`.trim();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function sanitizeHeaders(headers: unknown): ProviderHeaders {
  if (!isRecord(headers)) return undefined;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.trim()) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function parseModelRef(modelRef: string | undefined, config: Record<string, unknown>): { provider: string; model: string } | undefined {
  if (typeof modelRef === "string" && modelRef.includes("/")) {
    const [provider, ...rest] = modelRef.split("/");
    const model = rest.join("/").trim();
    if (provider?.trim() && model) {
      return { provider: provider.trim(), model };
    }
  }

  const modelsConfig = isRecord(config.models) ? config.models : undefined;
  const providers = modelsConfig && isRecord(modelsConfig.providers) ? modelsConfig.providers : undefined;
  if (!providers) return undefined;

  if (typeof modelRef === "string" && modelRef.trim()) {
    const providerEntries = Object.entries(providers);
    if (providerEntries.length === 1) {
      return { provider: providerEntries[0]![0], model: modelRef.trim() };
    }
  }

  for (const [provider, providerConfig] of Object.entries(providers)) {
    if (!isRecord(providerConfig)) continue;
    const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
    const firstModel = models.find((entry) => isRecord(entry) && typeof entry.id === "string" && entry.id.trim());
    if (firstModel && isRecord(firstModel)) {
      return { provider, model: String(firstModel.id).trim() };
    }
  }
  return undefined;
}

function resolveAgentPrimaryModel(config: Record<string, unknown>, agentId?: string): string | undefined {
  const agents = isRecord(config.agents) ? config.agents : undefined;
  const defaults = agents && isRecord(agents.defaults) ? agents.defaults : undefined;
  const defaultsModel = defaults && isRecord(defaults.model) ? defaults.model : undefined;

  if (agentId && agents && isRecord(agents[agentId])) {
    const agentConfig = agents[agentId] as Record<string, unknown>;
    const agentModel = isRecord(agentConfig.model) ? agentConfig.model : undefined;
    if (typeof agentModel?.primary === "string" && agentModel.primary.trim()) {
      return agentModel.primary.trim();
    }
  }

  if (typeof defaultsModel?.primary === "string" && defaultsModel.primary.trim()) {
    return defaultsModel.primary.trim();
  }

  return undefined;
}

function detectPreferredOutputLanguage(messages: MemoryMessage[]): string | undefined {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  if (/[\u4e00-\u9fff]/.test(userText)) return "Simplified Chinese";
  return undefined;
}

function buildPrompt(timestamp: string, messages: MemoryMessage[], extraInstruction?: string): string {
  const conversation = messages.map((message, index) => ({
    index,
    role: message.role,
    content: message.content,
  }));
  const preferredLanguage = detectPreferredOutputLanguage(messages);

  const sections = [
    "Conversation timestamp:",
    timestamp,
    "",
    "Visible conversation messages:",
    JSON.stringify(conversation, null, 2),
    "",
    "Remember:",
    "- summary should describe the session at a glance.",
    "- situation_time_info should read like a short progress update anchored to this conversation moment.",
    "- facts should be durable and future-useful, not turn-specific noise.",
    "- projects should only include trackable ongoing efforts.",
    "- if there are two or more unrelated ongoing threads, list them as separate project entries.",
    "- health/caregiving/problem-management threads count as projects when they are ongoing across turns.",
  ];
  if (preferredLanguage) {
    sections.push(`- Write all natural-language output fields in ${preferredLanguage}.`);
  }
  if (extraInstruction) {
    sections.push("", "Additional requirement:", extraInstruction);
  }
  return sections.join("\n");
}

function buildProjectCompletionPrompt(input: {
  timestamp: string;
  messages: MemoryMessage[];
  summary: string;
  facts: FactCandidate[];
  projectDetails: ProjectDetail[];
}): string {
  return JSON.stringify({
    timestamp: input.timestamp,
    messages: input.messages.map((message, index) => ({
      index,
      role: message.role,
      content: truncateForPrompt(message.content, 220),
    })),
    current_summary: input.summary,
    current_facts: input.facts,
    current_projects: input.projectDetails,
  }, null, 2);
}

function buildTopicShiftPrompt(input: LlmTopicShiftInput): string {
  return JSON.stringify({
    current_topic_summary: truncateForPrompt(input.currentTopicSummary, 160),
    recent_user_turns: input.recentUserTurns.map((value) => truncateForPrompt(value, 180)).slice(-8),
    incoming_user_turns: input.incomingUserTurns.map((value) => truncateForPrompt(value, 180)).slice(-6),
  }, null, 2);
}

function buildDailyTimeSummaryPrompt(input: LlmDailyTimeSummaryInput): string {
  return JSON.stringify({
    date_key: input.dateKey,
    existing_daily_summary: truncateForPrompt(input.existingSummary, 320),
    new_l1: {
      summary: truncateForPrompt(input.l1.summary, 220),
      situation_time_info: truncateForPrompt(input.l1.situationTimeInfo, 220),
      projects: input.l1.projectDetails.map((project) => ({
        name: project.name,
        status: project.status,
        summary: truncateForPrompt(project.summary, 160),
        latest_progress: truncateForPrompt(project.latestProgress, 160),
      })),
      facts: input.l1.facts.map((fact) => ({
        key: fact.factKey,
        value: truncateForPrompt(fact.factValue, 120),
      })).slice(0, 10),
    },
  }, null, 2);
}

function buildGlobalProfilePrompt(input: LlmGlobalProfileInput): string {
  return JSON.stringify({
    existing_profile: truncateForPrompt(input.existingProfile, 320),
    new_l1: {
      summary: truncateForPrompt(input.l1.summary, 220),
      situation_time_info: truncateForPrompt(input.l1.situationTimeInfo, 160),
      facts: input.l1.facts.map((fact) => ({
        key: fact.factKey,
        value: truncateForPrompt(fact.factValue, 140),
        confidence: fact.confidence,
      })).slice(0, 16),
      projects: input.l1.projectDetails.map((project) => ({
        name: project.name,
        status: project.status,
        summary: truncateForPrompt(project.summary, 140),
      })).slice(0, 8),
    },
  }, null, 2);
}

function extractFirstJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty extraction response");
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const start = trimmed.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in extraction response");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, index + 1);
    }
  }

  throw new Error("Incomplete JSON object in extraction response");
}

function slugifyKeyPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function normalizeStatus(value: unknown): ProjectStatus {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "planned") return "planned";
  if (normalized === "in_progress" || normalized === "in progress") return "in_progress";
  if (normalized === "blocked") return "blocked";
  if (normalized === "on_hold" || normalized === "on hold") return "on_hold";
  if (normalized === "done" || normalized === "completed" || normalized === "complete") return "done";
  return "unknown";
}

function buildFallbackSituationTimeInfo(timestamp: string, summary: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return summary;
  const yyyyMmDd = date.toISOString().slice(0, 10);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${yyyyMmDd} ${hour}:${minute} ${summary}`.trim();
}

function normalizeFacts(items: unknown): FactCandidate[] {
  if (!Array.isArray(items)) return [];
  const facts = new Map<string, FactCandidate>();

  for (const item of items) {
    const raw = item as RawFactItem;
    const category = typeof raw.category === "string" ? slugifyKeyPart(raw.category) : "context";
    const subject = typeof raw.subject === "string" && raw.subject.trim()
      ? slugifyKeyPart(raw.subject)
      : slugifyKeyPart(typeof raw.value === "string" ? raw.value : "item");
    const value = typeof raw.value === "string" ? normalizeWhitespace(raw.value) : "";
    if (!value) continue;
    const factKey = `${category}:${subject}`;
    facts.set(factKey, {
      factKey,
      factValue: truncate(value, 180),
      confidence: clampConfidence(raw.confidence, 0.65),
    });
  }

  return Array.from(facts.values()).slice(0, 12);
}

function normalizeProjectDetails(items: unknown): ProjectDetail[] {
  if (!Array.isArray(items)) return [];
  const projects = new Map<string, ProjectDetail>();

  for (const item of items) {
    const raw = item as RawProjectItem;
    const key = typeof raw.key === "string" && raw.key.trim()
      ? slugifyKeyPart(raw.key)
      : "";
    const name = typeof raw.name === "string" ? normalizeWhitespace(raw.name) : "";
    if (!name) continue;
    const stableKey = key || slugifyKeyPart(name);
    if (projects.has(stableKey)) continue;
    projects.set(stableKey, {
      key: stableKey,
      name: truncate(name, 80),
      status: normalizeStatus(raw.status),
      summary: truncate(typeof raw.summary === "string" ? normalizeWhitespace(raw.summary) : "", 220),
      latestProgress: truncate(typeof raw.latest_progress === "string" ? normalizeWhitespace(raw.latest_progress) : "", 220),
      confidence: clampConfidence(raw.confidence, 0.7),
    });
  }

  return Array.from(projects.values()).slice(0, 8);
}

function truncateForPrompt(value: string, maxLength: number): string {
  return truncate(normalizeWhitespace(value), maxLength);
}

function normalizeStringArray(items: unknown, maxItems: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeIntent(value: unknown): IntentType {
  if (value === "time" || value === "project" || value === "fact" || value === "general") return value;
  return "general";
}

function normalizeEnoughAt(value: unknown): RetrievalResult["enoughAt"] {
  if (value === "l2" || value === "l1" || value === "l0" || value === "none") return value;
  return "none";
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function extractChatCompletionsText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("Invalid chat completions payload");
  }
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error("Missing chat completion message");
  }
  const content = firstChoice.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  throw new Error("Unsupported chat completion content shape");
}

function extractResponsesText(payload: unknown): string {
  if (!isRecord(payload)) throw new Error("Invalid responses payload");
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  if (!Array.isArray(payload.output)) throw new Error("Responses payload missing output");

  const chunks: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (isRecord(part) && typeof part.text === "string") chunks.push(part.text);
    }
  }
  const text = chunks.join("\n").trim();
  if (!text) throw new Error("Responses payload did not contain text");
  return text;
}

function looksLikeEnvVarName(value: string): boolean {
  return /^[A-Z0-9_]+$/.test(value);
}

export class LlmMemoryExtractor {
  constructor(
    private readonly config: Record<string, unknown>,
    private readonly runtime: Record<string, unknown> | undefined,
    private readonly logger?: LoggerLike,
  ) {}

  private resolveSelection(agentId?: string): ModelSelection {
    const modelRef = resolveAgentPrimaryModel(this.config, agentId);
    const parsed = parseModelRef(modelRef, this.config);
    if (!parsed) throw new Error("Could not resolve an OpenClaw model for memory extraction");

    const modelsConfig = isRecord(this.config.models) ? this.config.models : undefined;
    const providers = modelsConfig && isRecord(modelsConfig.providers) ? modelsConfig.providers : undefined;
    const providerConfig = providers && isRecord(providers[parsed.provider])
      ? providers[parsed.provider] as Record<string, unknown>
      : undefined;
    const configuredModel = Array.isArray(providerConfig?.models)
      ? providerConfig.models.find((item) => isRecord(item) && item.id === parsed.model)
      : undefined;
    const modelConfig = isRecord(configuredModel) ? configuredModel : undefined;

    const api = typeof modelConfig?.api === "string"
      ? modelConfig.api
      : typeof providerConfig?.api === "string"
        ? providerConfig.api
        : "openai-completions";
    const baseUrl = typeof modelConfig?.baseUrl === "string"
      ? modelConfig.baseUrl
      : typeof providerConfig?.baseUrl === "string"
        ? providerConfig.baseUrl
        : undefined;
    const headers = {
      ...sanitizeHeaders(providerConfig?.headers),
      ...sanitizeHeaders(modelConfig?.headers),
    };

    const selection: ModelSelection = {
      provider: parsed.provider,
      model: parsed.model,
      api,
    };
    if (baseUrl?.trim()) selection.baseUrl = stripTrailingSlash(baseUrl.trim());
    if (Object.keys(headers).length > 0) selection.headers = headers;
    return selection;
  }

  private async resolveApiKey(provider: string): Promise<string> {
    const modelAuth = this.runtime && isRecord(this.runtime.modelAuth)
      ? this.runtime.modelAuth as Record<string, unknown>
      : undefined;
    const resolver = typeof modelAuth?.resolveApiKeyForProvider === "function"
      ? modelAuth.resolveApiKeyForProvider as (params: { provider: string; cfg?: Record<string, unknown> }) => Promise<{ apiKey?: string }>
      : undefined;
    if (resolver) {
      const auth = await resolver({ provider, cfg: this.config });
      if (auth?.apiKey && String(auth.apiKey).trim()) {
        return String(auth.apiKey).trim();
      }
    }

    const modelsConfig = isRecord(this.config.models) ? this.config.models : undefined;
    const providers = modelsConfig && isRecord(modelsConfig.providers) ? modelsConfig.providers : undefined;
    const providerConfig = providers && isRecord(providers[provider])
      ? providers[provider] as Record<string, unknown>
      : undefined;
    const configured = typeof providerConfig?.apiKey === "string" ? providerConfig.apiKey.trim() : "";
    if (configured) {
      if (looksLikeEnvVarName(configured) && typeof process.env[configured] === "string" && process.env[configured]?.trim()) {
        return process.env[configured]!.trim();
      }
      return configured;
    }

    throw new Error(`No API key resolved for extraction provider "${provider}"`);
  }

  private async callStructuredJson(input: {
    systemPrompt: string;
    userPrompt: string;
    agentId?: string;
    requestLabel: string;
  }): Promise<string> {
    const selection = this.resolveSelection(input.agentId);
    if (!selection.baseUrl) {
      throw new Error(`${input.requestLabel} provider "${selection.provider}" does not have a baseUrl`);
    }
    const apiKey = await this.resolveApiKey(selection.provider);
    const headers = new Headers(selection.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);
    const apiType = selection.api.trim().toLowerCase();
    let url = "";
    let body: Record<string, unknown>;

    if (apiType === "openai-responses" || apiType === "responses") {
      url = `${selection.baseUrl}/responses`;
      body = {
        model: selection.model,
        temperature: 0,
        input: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      };
    } else {
      url = `${selection.baseUrl}/chat/completions`;
      body = {
        model: selection.model,
        temperature: 0,
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      };
    }

    const execute = async (payloadBody: Record<string, unknown>): Promise<Response> => fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payloadBody),
    });

    let response = await execute(body);
    if (!response.ok && "response_format" in body) {
      const fallbackBody = { ...body };
      delete fallbackBody.response_format;
      response = await execute(fallbackBody);
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${input.requestLabel} request failed (${response.status}): ${truncate(errorText, 300)}`);
    }

    const payload = await response.json();
    return apiType === "openai-responses" || apiType === "responses"
      ? extractResponsesText(payload)
      : extractChatCompletionsText(payload);
  }

  async extract(input: { timestamp: string; messages: MemoryMessage[]; agentId?: string }): Promise<SessionExtractionResult> {
    let parsed: RawExtractionPayload | undefined;
    let lastError: unknown;
    for (const extraInstruction of [
      undefined,
      "Return one complete JSON object only. Do not use ellipses, placeholders, comments, markdown fences, or trailing commas.",
    ]) {
      try {
        const rawText = await this.callStructuredJson({
          systemPrompt: EXTRACTION_SYSTEM_PROMPT,
          userPrompt: buildPrompt(input.timestamp, input.messages, extraInstruction),
          requestLabel: "Extraction",
          ...(input.agentId ? { agentId: input.agentId } : {}),
        });
        parsed = JSON.parse(extractFirstJsonObject(rawText)) as RawExtractionPayload;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!parsed) throw lastError;
    const summary = truncate(
      typeof parsed.summary === "string" ? normalizeWhitespace(parsed.summary) : "",
      280,
    );
    if (!summary) {
      throw new Error("Extraction payload did not include a usable summary");
    }

    let projectDetails = normalizeProjectDetails(parsed.projects);
    const facts = normalizeFacts(parsed.facts);
    projectDetails = await this.completeProjectDetails({
      timestamp: input.timestamp,
      messages: input.messages,
      summary,
      facts,
      projectDetails,
      ...(input.agentId ? { agentId: input.agentId } : {}),
    });
    const situationTimeInfoRaw = typeof parsed.situation_time_info === "string"
      ? normalizeWhitespace(parsed.situation_time_info)
      : "";
    const situationTimeInfo = truncate(
      situationTimeInfoRaw || buildFallbackSituationTimeInfo(input.timestamp, summary),
      220,
    );

    this.logger?.info?.(
      `[youarememory] llm extraction complete summary=${summary.slice(0, 60)} projects=${projectDetails.length} facts=${facts.length}`,
    );

    return {
      summary,
      situationTimeInfo,
      facts,
      projectDetails,
    };
  }

  private async completeProjectDetails(input: {
    timestamp: string;
    messages: MemoryMessage[];
    summary: string;
    facts: FactCandidate[];
    projectDetails: ProjectDetail[];
    agentId?: string;
  }): Promise<ProjectDetail[]> {
    try {
      const raw = await this.callStructuredJson({
        systemPrompt: PROJECT_COMPLETION_SYSTEM_PROMPT,
        userPrompt: buildProjectCompletionPrompt(input),
        requestLabel: "Project completion",
        ...(input.agentId ? { agentId: input.agentId } : {}),
      });
      const parsed = JSON.parse(extractFirstJsonObject(raw)) as RawExtractionPayload;
      const completed = normalizeProjectDetails(parsed.projects);
      return completed.length > 0 ? completed : input.projectDetails;
    } catch (error) {
      this.logger?.warn?.(`[youarememory] project completion fallback: ${String(error)}`);
      return input.projectDetails;
    }
  }

  async judgeTopicShift(input: LlmTopicShiftInput): Promise<LlmTopicShiftDecision> {
    const fallbackSummary = truncate(
      normalizeWhitespace(
        input.currentTopicSummary
          || input.incomingUserTurns[input.incomingUserTurns.length - 1]
          || input.recentUserTurns[input.recentUserTurns.length - 1]
          || "当前话题",
      ),
      120,
    );
    if (input.incomingUserTurns.length === 0) {
      return { topicChanged: false, topicSummary: fallbackSummary };
    }
    if (!input.currentTopicSummary.trim() && input.recentUserTurns.length === 0) {
      return {
        topicChanged: false,
        topicSummary: truncate(input.incomingUserTurns.map((item) => normalizeWhitespace(item)).join(" / "), 120) || fallbackSummary,
      };
    }

    try {
      const raw = await this.callStructuredJson({
        systemPrompt: TOPIC_BOUNDARY_SYSTEM_PROMPT,
        userPrompt: buildTopicShiftPrompt(input),
        requestLabel: "Topic shift",
        ...(input.agentId ? { agentId: input.agentId } : {}),
      });
      const parsed = JSON.parse(extractFirstJsonObject(raw)) as RawTopicShiftPayload;
      return {
        topicChanged: normalizeBoolean(parsed.topic_changed, false),
        topicSummary: truncate(
          typeof parsed.topic_summary === "string" && parsed.topic_summary.trim()
            ? normalizeWhitespace(parsed.topic_summary)
            : fallbackSummary,
          120,
        ),
      };
    } catch (error) {
      this.logger?.warn?.(`[youarememory] topic shift fallback: ${String(error)}`);
      return { topicChanged: false, topicSummary: fallbackSummary };
    }
  }

  async resolveProjectIdentity(input: LlmProjectResolutionInput): Promise<ProjectDetail> {
    if (input.existingProjects.length === 0) return input.project;
    const candidates = input.existingProjects.slice(0, 24).map((project) => ({
      project_key: project.projectKey,
      project_name: project.projectName,
      summary: truncateForPrompt(project.summary, 160),
      latest_progress: truncateForPrompt(project.latestProgress, 160),
      status: project.currentStatus,
    }));
    try {
      const raw = await this.callStructuredJson({
        systemPrompt: PROJECT_RESOLUTION_SYSTEM_PROMPT,
        userPrompt: JSON.stringify({
          incoming_project: {
            key: input.project.key,
            name: input.project.name,
            summary: input.project.summary,
            latest_progress: input.project.latestProgress,
            status: input.project.status,
          },
          existing_projects: candidates,
        }, null, 2),
        requestLabel: "Project resolution",
        ...(input.agentId ? { agentId: input.agentId } : {}),
      });
      const parsed = JSON.parse(extractFirstJsonObject(raw)) as RawProjectResolutionPayload;
      const matchedProjectKey = typeof parsed.matched_project_key === "string"
        ? parsed.matched_project_key.trim()
        : "";
      const matched = matchedProjectKey
        ? input.existingProjects.find((project) => project.projectKey === matchedProjectKey)
        : undefined;
      return {
        ...input.project,
        key: matched?.projectKey
          ?? (typeof parsed.canonical_key === "string" && parsed.canonical_key.trim()
            ? slugifyKeyPart(parsed.canonical_key)
            : input.project.key),
        name: matched?.projectName
          ?? (typeof parsed.canonical_name === "string" && parsed.canonical_name.trim()
            ? truncateForPrompt(parsed.canonical_name, 80)
            : input.project.name),
      };
    } catch (error) {
      this.logger?.warn?.(`[youarememory] project resolution fallback for ${input.project.key}: ${String(error)}`);
      return input.project;
    }
  }

  async rewriteDailyTimeSummary(input: LlmDailyTimeSummaryInput): Promise<string> {
    try {
      const raw = await this.callStructuredJson({
        systemPrompt: DAILY_TIME_SUMMARY_SYSTEM_PROMPT,
        userPrompt: buildDailyTimeSummaryPrompt(input),
        requestLabel: "Daily summary",
        ...(input.agentId ? { agentId: input.agentId } : {}),
      });
      const parsed = JSON.parse(extractFirstJsonObject(raw)) as RawDailySummaryPayload;
      const summary = typeof parsed.summary === "string" ? normalizeWhitespace(parsed.summary) : "";
      if (summary) return truncate(summary, 280);
    } catch (error) {
      this.logger?.warn?.(`[youarememory] daily summary fallback: ${String(error)}`);
    }
    return truncate(input.l1.situationTimeInfo || input.l1.summary || input.existingSummary, 280);
  }

  async rewriteGlobalProfile(input: LlmGlobalProfileInput): Promise<string> {
    try {
      const raw = await this.callStructuredJson({
        systemPrompt: GLOBAL_PROFILE_SYSTEM_PROMPT,
        userPrompt: buildGlobalProfilePrompt(input),
        requestLabel: "Global profile",
        ...(input.agentId ? { agentId: input.agentId } : {}),
      });
      const parsed = JSON.parse(extractFirstJsonObject(raw)) as RawProfilePayload;
      const profileText = typeof parsed.profile_text === "string" ? normalizeWhitespace(parsed.profile_text) : "";
      if (profileText) return truncate(profileText, 420);
    } catch (error) {
      this.logger?.warn?.(`[youarememory] global profile fallback: ${String(error)}`);
    }

    const fallbackFacts = input.l1.facts.map((fact) => fact.factValue).filter(Boolean).slice(0, 8).join("；");
    return truncate(input.existingProfile || fallbackFacts || input.l1.summary, 420);
  }

  async reasonOverMemory(input: LlmReasoningInput): Promise<LlmReasoningSelection> {
    if (!input.profile && input.l2Time.length === 0 && input.l2Projects.length === 0 && input.l1Windows.length === 0 && input.l0Sessions.length === 0) {
      return {
        intent: "general",
        enoughAt: "none",
        useProfile: false,
        l2Ids: [],
        l1Ids: [],
        l0Ids: [],
      };
    }

    const raw = await this.callStructuredJson({
      systemPrompt: REASONING_SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        query: input.query,
        profile: input.profile
          ? {
              id: input.profile.recordId,
              text: truncateForPrompt(input.profile.profileText, 260),
            }
          : null,
        l2_time: input.l2Time.map((item) => ({
          id: item.l2IndexId,
          date_key: item.dateKey,
          summary: truncateForPrompt(item.summary, 180),
        })),
        l2_project: input.l2Projects.map((item) => ({
          id: item.l2IndexId,
          project_key: item.projectKey,
          project_name: item.projectName,
          summary: truncateForPrompt(item.summary, 180),
          latest_progress: truncateForPrompt(item.latestProgress, 180),
          status: item.currentStatus,
        })),
        l1_windows: input.l1Windows.map((item) => ({
          id: item.l1IndexId,
          session_key: item.sessionKey,
          time_period: item.timePeriod,
          summary: truncateForPrompt(item.summary, 180),
          situation: truncateForPrompt(item.situationTimeInfo, 160),
          projects: item.projectDetails.map((project) => project.name),
        })),
        l0_sessions: input.l0Sessions.map((item) => ({
          id: item.l0IndexId,
          session_key: item.sessionKey,
          timestamp: item.timestamp,
          messages: item.messages
            .filter((message) => message.role === "user")
            .slice(-2)
            .map((message) => truncateForPrompt(message.content, 160)),
        })),
        limits: input.limits,
      }, null, 2),
      requestLabel: "Reasoning",
      ...(input.agentId ? { agentId: input.agentId } : {}),
    });
    const parsed = JSON.parse(extractFirstJsonObject(raw)) as RawReasoningPayload;
    return {
      intent: normalizeIntent(parsed.intent),
      enoughAt: normalizeEnoughAt(parsed.enough_at),
      useProfile: normalizeBoolean(parsed.use_profile, false),
      l2Ids: normalizeStringArray(parsed.l2_ids, input.limits.l2),
      l1Ids: normalizeStringArray(parsed.l1_ids, input.limits.l1),
      l0Ids: normalizeStringArray(parsed.l0_ids, input.limits.l0),
    };
  }
}
