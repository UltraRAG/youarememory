import type { MemoryMessage } from "./core/types.js";

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

export function normalizeMessages(
  rawMessages: unknown[],
  options: { includeAssistant: boolean; maxMessageChars: number; captureStrategy: "last_turn" | "full_session" },
): MemoryMessage[] {
  const all: MemoryMessage[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as Record<string, unknown>;
    const role = typeof msg.role === "string" ? msg.role : "";
    if (!role) continue;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    if (role === "assistant" && !options.includeAssistant) continue;

    const content = extractTextFromContent(msg.content).trim();
    if (!content) continue;
    const normalized: MemoryMessage = {
      role,
      content: truncate(content, options.maxMessageChars),
    };
    if (typeof msg.id === "string") {
      normalized.msgId = msg.id;
    }
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
