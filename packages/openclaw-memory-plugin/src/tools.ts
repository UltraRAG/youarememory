import { MemoryRepository, ReasoningRetriever } from "./core/index.js";
import type { PluginTool } from "./plugin-api.js";

function jsonResult(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function toLimit(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(1, Math.floor(raw));
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return Math.max(1, parsed);
  }
  return fallback;
}

export function buildPluginTools(
  repository: MemoryRepository,
  retriever: ReasoningRetriever,
): PluginTool[] {
  return [
    {
      name: "memory_recall",
      label: "Recall Multi-Level Memory",
      description: "Retrieve memory context using L2->L1->L0 fallback reasoning.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Question or topic to search in memory." },
          limit: { type: "number", description: "Maximum items per level." },
        },
        required: ["query"],
      },
      async execute(_id, params) {
        const input = (params ?? {}) as Record<string, unknown>;
        const query = typeof input.query === "string" ? input.query : "";
        if (!query.trim()) {
          return jsonResult({ ok: false, error: "query is required" });
        }
        const limit = toLimit(input.limit, 6);
        const result = await retriever.retrieve(query, {
          retrievalMode: "explicit",
          l2Limit: limit,
          l1Limit: limit,
          l0Limit: Math.max(3, Math.floor(limit / 2)),
        });
        return jsonResult({ ok: true, ...result });
      },
    },
    {
      name: "memory_store",
      label: "Append Profile Note",
      description: "Append a manual note into the global user profile summary.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Profile note content to append." },
        },
        required: ["content"],
      },
      async execute(_id, params) {
        const input = (params ?? {}) as Record<string, unknown>;
        const content = typeof input.content === "string" ? input.content.trim() : "";
        if (!content) return jsonResult({ ok: false, error: "content is required" });
        const profile = repository.appendToGlobalProfile(content);
        return jsonResult({ ok: true, profile });
      },
    },
    {
      name: "search_l2",
      label: "Search L2 Index",
      description: "Search time/project second-level indexes by fuzzy query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          type: { type: "string", enum: ["time", "project", "general"] },
          limit: { type: "number" },
        },
        required: ["query"],
      },
      async execute(_id, params) {
        const input = (params ?? {}) as Record<string, unknown>;
        const query = typeof input.query === "string" ? input.query : "";
        const limit = toLimit(input.limit, 8);
        const type = typeof input.type === "string" ? input.type : "general";
        const intent = type === "time" || type === "project" ? type : "general";
        const results = await retriever.searchL2(query, intent, limit);
        return jsonResult({ ok: true, count: results.length, results });
      },
    },
    {
      name: "search_l1",
      label: "Search L1 Index",
      description: "Search structured conversation windows.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          l1Ids: { type: "array", items: { type: "string" } },
          limit: { type: "number" },
        },
        required: ["query"],
      },
      async execute(_id, params) {
        const input = (params ?? {}) as Record<string, unknown>;
        const query = typeof input.query === "string" ? input.query : "";
        const ids = Array.isArray(input.l1Ids) ? input.l1Ids.filter((v): v is string => typeof v === "string") : [];
        const limit = toLimit(input.limit, 8);
        const results = await retriever.searchL1(query, ids, limit);
        return jsonResult({ ok: true, count: results.length, results });
      },
    },
    {
      name: "search_l0",
      label: "Search L0 Logs",
      description: "Search raw conversation logs as final fallback.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          l0Ids: { type: "array", items: { type: "string" } },
          limit: { type: "number" },
        },
        required: ["query"],
      },
      async execute(_id, params) {
        const input = (params ?? {}) as Record<string, unknown>;
        const query = typeof input.query === "string" ? input.query : "";
        const ids = Array.isArray(input.l0Ids) ? input.l0Ids.filter((v): v is string => typeof v === "string") : [];
        const limit = toLimit(input.limit, 6);
        const results = await retriever.searchL0(query, ids, limit);
        return jsonResult({ ok: true, count: results.length, results });
      },
    },
  ];
}
