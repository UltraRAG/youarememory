from __future__ import annotations

from typing import Any


def _to_limit(raw: Any, fallback: int) -> int:
    if isinstance(raw, int) and raw > 0:
        return raw
    if isinstance(raw, float) and raw > 0:
        return int(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = int(raw.strip())
            return max(1, parsed)
        except ValueError:
            return fallback
    return fallback


class MemoryTools:
    def __init__(self, repository, retriever):
        self.repository = repository
        self.retriever = retriever

    def memory_recall(self, query: str, limit: int = 6, include_facts: bool = True, with_trace: bool = True) -> dict:
        if not query.strip():
            return {"ok": False, "error": "query is required"}
        result = self.retriever.retrieve(
            query,
            {
                "l2Limit": _to_limit(limit, 6),
                "l1Limit": _to_limit(limit, 6),
                "l0Limit": max(3, int(_to_limit(limit, 6) / 2)),
                "includeFacts": include_facts,
                "withTrace": with_trace,
            },
        )
        return {"ok": True, **result}

    def memory_store(self, content: str, fact_key: str | None = None, confidence: float = 0.8) -> dict:
        text = content.strip()
        if not text:
            return {"ok": False, "error": "content is required"}
        explicit_key = fact_key.strip() if isinstance(fact_key, str) and fact_key.strip() else f"manual:{text[:64].lower()}"
        bounded_confidence = max(0.1, min(1.0, float(confidence)))
        fact = {
            "factKey": explicit_key,
            "factValue": text,
            "confidence": bounded_confidence,
        }
        self.repository.upsert_global_facts([fact])
        return {"ok": True, "stored": fact}

    def search_l2(self, query: str, search_type: str = "general", limit: int = 8) -> dict:
        intent = search_type if search_type in ("time", "project") else "general"
        results = self.retriever.search_l2(query, intent, _to_limit(limit, 8))
        return {"ok": True, "count": len(results), "results": results}

    def search_l1(self, query: str, l1_ids: list[str] | None = None, limit: int = 8) -> dict:
        ids = l1_ids or []
        results = self.retriever.search_l1(query, ids, _to_limit(limit, 8))
        return {"ok": True, "count": len(results), "results": results}

    def search_l0(self, query: str, l0_ids: list[str] | None = None, limit: int = 6) -> dict:
        ids = l0_ids or []
        results = self.retriever.search_l0(query, ids, _to_limit(limit, 6))
        return {"ok": True, "count": len(results), "results": results}

    def memory_search(self, query: str, limit: int = 6) -> dict:
        result = self.memory_recall(query=query, limit=limit, include_facts=True, with_trace=True)
        if not result.get("ok"):
            return result
        result["alias"] = "memory_recall"
        return result

    def invoke(self, tool_name: str, params: dict[str, Any] | None = None) -> dict:
        payload = params or {}
        if tool_name == "memory_recall":
            return self.memory_recall(
                query=str(payload.get("query", "")),
                limit=_to_limit(payload.get("limit"), 6),
                include_facts=bool(payload.get("includeFacts", True)),
                with_trace=bool(payload.get("withTrace", True)),
            )
        if tool_name == "memory_store":
            return self.memory_store(
                content=str(payload.get("content", "")),
                fact_key=payload.get("factKey"),
                confidence=float(payload.get("confidence", 0.8)),
            )
        if tool_name == "search_l2":
            return self.search_l2(
                query=str(payload.get("query", "")),
                search_type=str(payload.get("type", "general")),
                limit=_to_limit(payload.get("limit"), 8),
            )
        if tool_name == "search_l1":
            raw_ids = payload.get("l1Ids", [])
            l1_ids = [str(item) for item in raw_ids] if isinstance(raw_ids, list) else []
            return self.search_l1(
                query=str(payload.get("query", "")),
                l1_ids=l1_ids,
                limit=_to_limit(payload.get("limit"), 8),
            )
        if tool_name == "search_l0":
            raw_ids = payload.get("l0Ids", [])
            l0_ids = [str(item) for item in raw_ids] if isinstance(raw_ids, list) else []
            return self.search_l0(
                query=str(payload.get("query", "")),
                l0_ids=l0_ids,
                limit=_to_limit(payload.get("limit"), 6),
            )
        if tool_name == "memory_search":
            return self.memory_search(
                query=str(payload.get("query", "")),
                limit=_to_limit(payload.get("limit"), 6),
            )
        return {"ok": False, "error": f"unknown tool: {tool_name}"}
