import type { FactCandidate, MemoryMessage, ProjectDetail, ProjectStatus } from "../types.js";

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

export interface SessionExtractionResult {
  summary: string;
  situationTimeInfo: string;
  facts: FactCandidate[];
  projectDetails: ProjectDetail[];
}

const EXTRACTION_SYSTEM_PROMPT = `
You are a memory indexing engine for a conversational assistant.

Your job is to convert a visible user/assistant conversation into durable memory indexes.

Rules:
- Only use information explicitly present in the conversation.
- Ignore system prompts, tool scaffolding, hidden reasoning, formatting artifacts, and operational chatter.
- Be conservative. If something is ambiguous, omit it.
- Track projects only when they look like a real ongoing effort, task stream, research topic, implementation effort, or recurring problem worth revisiting later.
- Do not treat casual one-off mentions as projects.
- Extract facts only when they are likely to matter in future conversations: preferences, constraints, goals, identity, long-lived context, stable relationships, or durable project context.
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
  ];
  if (preferredLanguage) {
    sections.push(`- Write all natural-language output fields in ${preferredLanguage}.`);
  }
  if (extraInstruction) {
    sections.push("", "Additional requirement:", extraInstruction);
  }
  return sections.join("\n");
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
    if (!resolver) throw new Error("OpenClaw runtime modelAuth resolver is not available");
    const auth = await resolver({ provider, cfg: this.config });
    if (!auth?.apiKey || !String(auth.apiKey).trim()) {
      throw new Error(`No API key resolved for extraction provider "${provider}"`);
    }
    return String(auth.apiKey).trim();
  }

  private async callModel(
    messages: MemoryMessage[],
    timestamp: string,
    agentId?: string,
    extraInstruction?: string,
  ): Promise<string> {
    const selection = this.resolveSelection(agentId);
    if (!selection.baseUrl) {
      throw new Error(`Extraction provider "${selection.provider}" does not have a baseUrl`);
    }
    const apiKey = await this.resolveApiKey(selection.provider);
    const headers = new Headers(selection.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);

    const prompt = buildPrompt(timestamp, messages, extraInstruction);
    const apiType = selection.api.trim().toLowerCase();
    let url = "";
    let body: Record<string, unknown>;

    if (apiType === "openai-responses" || apiType === "responses") {
      url = `${selection.baseUrl}/responses`;
      body = {
        model: selection.model,
        temperature: 0,
        input: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: prompt },
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
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: prompt },
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
      throw new Error(`Extraction request failed (${response.status}): ${truncate(errorText, 300)}`);
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
        const rawText = await this.callModel(input.messages, input.timestamp, input.agentId, extraInstruction);
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

    const projectDetails = normalizeProjectDetails(parsed.projects);
    const facts = normalizeFacts(parsed.facts);
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
}
