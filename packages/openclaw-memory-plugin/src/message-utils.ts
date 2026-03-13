import type { MemoryMessage } from "./core/types.js";

const MEMORY_CONTEXT_HEADER = "You are using multi-level memory indexes for this turn.";
const MEMORY_CONTEXT_FOOTER = "Only use the above as supporting context; prioritize the user's latest request.";
const SESSION_START_PREFIX = "A new session was started via /new or /reset.";
const SLUG_PROMPT_PREFIX = "Based on this conversation, generate a short 1-2 word filename slug";

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const blocks: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        blocks.push(b.text);
      }
    }
    return blocks.join("\n");
  }
  return "";
}

function stripInjectedMemoryContext(text: string): string {
  if (!text.includes(MEMORY_CONTEXT_HEADER)) return text;
  const escapedHeader = MEMORY_CONTEXT_HEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedFooter = MEMORY_CONTEXT_FOOTER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedHeader}[\\s\\S]*?${escapedFooter}\\s*`, "g");
  const stripped = text.replace(pattern, "").trim();
  if (stripped) return stripped;

  // If message only contains injected memory context, drop it.
  if (text.trim().startsWith(MEMORY_CONTEXT_HEADER)) return "";
  return text.trim();
}

function stripUntrustedSenderMetadata(text: string): string {
  const codeFencePattern = /Sender\s*\(untrusted metadata\)\s*:\s*```(?:json)?[\s\S]*?```\s*/gi;
  const inlineJsonPattern = /Sender\s*\(untrusted metadata\)\s*:\s*\{[\s\S]*?\}\s*/gi;
  return text
    .replace(codeFencePattern, "")
    .replace(inlineJsonPattern, "");
}

function stripLeadingTimestampPrefix(text: string): string {
  return text.replace(/^\s*\[[^\]\n]*(?:\d{4}-\d{1,2}-\d{1,2}|GMT|UTC)[^\]\n]*\]\s*/i, "");
}

function stripLeadingSenderNoiseLines(text: string): string {
  const lines = text.split("\n");
  const isNoiseLine = (line: string): boolean => {
    const value = line.trim();
    if (!value) return true;
    if (value === "```" || value.toLowerCase() === "```json") return true;
    if (value === "{" || value === "}") return true;
    if (/^Sender\s*\(untrusted metadata\)\s*:?/i.test(value)) return true;
    if (/^"label"\s*:/.test(value)) return true;
    if (/^"id"\s*:/.test(value)) return true;
    if (/^\[[^\]\n]*(?:\d{4}-\d{1,2}-\d{1,2}|GMT|UTC)[^\]\n]*\]$/.test(value)) return true;
    return false;
  };

  while (lines.length > 0 && isNoiseLine(lines[0]!)) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function stripUserNoise(text: string): string {
  if (!text) return "";
  const hadSenderMetadata = /Sender\s*\(untrusted metadata\)\s*:?/i.test(text);
  let cleaned = stripInjectedMemoryContext(text);
  cleaned = stripUntrustedSenderMetadata(cleaned);
  cleaned = stripLeadingTimestampPrefix(cleaned);
  if (hadSenderMetadata) {
    cleaned = stripLeadingSenderNoiseLines(cleaned);
  }
  return cleaned.trim();
}

function stripAssistantThinking(text: string): string {
  const withoutLeadingThink = text
    .replace(/^[\s\S]*?<\/think>/i, "")
    .replace(/^[\s\S]*?<\/thinking>/i, "");

  const withoutThink = withoutLeadingThink
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<\/?think[^>]*>/gi, "")
    .replace(/<\/?thinking[^>]*>/gi, "");

  const lines = withoutThink
    .split("\n")
    .map((line) => line.trimEnd());

  const compact: string[] = [];
  let previousEmpty = false;
  for (const line of lines) {
    const empty = line.trim().length === 0;
    if (empty && previousEmpty) continue;
    compact.push(line);
    previousEmpty = empty;
  }

  const normalized = compact.join("\n").trim();
  const paragraphs = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 2) {
    const first = paragraphs[0] ?? "";
    const looksLikeMetaReasoning = (
      (/^用户/.test(first) && /(需要|应该|这是|表达|分享|说明|记录)/.test(first))
      || (/^搜索结果/.test(first) && /(需要|无法|不太理想)/.test(first))
      || (/^这搜索/.test(first) && /不太全|看不到|找不到/.test(first))
    );
    if (looksLikeMetaReasoning) {
      return paragraphs.slice(1).join("\n\n").trim();
    }
  }

  return normalized;
}

function hasToolCallContent(content: unknown): boolean {
  return Array.isArray(content) && content.some((block) => {
    if (!block || typeof block !== "object") return false;
    const type = (block as Record<string, unknown>).type;
    return type === "toolCall" || type === "toolResult";
  });
}

function shouldSkipUserMessage(content: string): boolean {
  if (!content) return true;
  return content.startsWith(SESSION_START_PREFIX) || content.startsWith(SLUG_PROMPT_PREFIX);
}

function shouldSkipAssistantMessage(rawContent: unknown, content: string): boolean {
  if (!content) return true;
  if (hasToolCallContent(rawContent)) return true;
  if (!content.includes("\n")) {
    const compact = content.trim();
    if ((/^用户/.test(compact) && /(需要|应该|这是|表达|分享|记录)/.test(compact))
      || (/^搜索结果/.test(compact) && /(需要|无法|不太理想)/.test(compact))) {
      return true;
    }
  }
  return false;
}

function normalizeSingleMessage(
  raw: unknown,
  options: { includeAssistant: boolean; maxMessageChars: number },
): MemoryMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const msg = raw as Record<string, unknown>;
  const role = typeof msg.role === "string" ? msg.role : "";
  if (role !== "user" && role !== "assistant") return undefined;
  if (role === "assistant" && !options.includeAssistant) return undefined;

  const rawContent = msg.content;
  const rawText = extractTextFromContent(rawContent).trim();
  const content = role === "user"
    ? stripUserNoise(rawText)
    : stripAssistantThinking(rawText);

  if (role === "user" && shouldSkipUserMessage(content)) return undefined;
  if (role === "assistant" && shouldSkipAssistantMessage(rawContent, content)) return undefined;
  if (!content) return undefined;

  const normalized: MemoryMessage = {
    role,
    content: truncate(content, options.maxMessageChars),
  };
  if (typeof msg.id === "string") {
    normalized.msgId = msg.id;
  }
  return normalized;
}

export function normalizeTranscriptMessage(
  rawMessage: unknown,
  options: { includeAssistant: boolean; maxMessageChars: number },
): MemoryMessage | undefined {
  return normalizeSingleMessage(rawMessage, options);
}

export function normalizeMessages(
  rawMessages: unknown[],
  options: { includeAssistant: boolean; maxMessageChars: number; captureStrategy: "last_turn" | "full_session" },
): MemoryMessage[] {
  const all: MemoryMessage[] = [];
  for (const raw of rawMessages) {
    const normalized = normalizeSingleMessage(raw, options);
    if (!normalized) continue;
    all.push(normalized);
  }

  if (options.captureStrategy === "full_session") return all;

  let lastUser = -1;
  for (let i = all.length - 1; i >= 0; i -= 1) {
    if (all[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  return lastUser >= 0 ? all.slice(lastUser) : all.slice(-2);
}
