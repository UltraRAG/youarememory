from __future__ import annotations

import json

from .intent_skill import classify_intent
from .utils_text import score_match, truncate


def _normalize_scored_l1(query: str, items: list[dict]) -> list[dict]:
    return [
        {
            "score": max(score_match(query, item["summary"]), score_match(query, item["situationTimeInfo"])),
            "item": item,
        }
        for item in items
    ]


def _normalize_scored_l0(query: str, items: list[dict]) -> list[dict]:
    return [{"score": score_match(query, json.dumps(item["messages"], ensure_ascii=False)), "item": item} for item in items]


def _sort_by_score_desc(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda item: item["score"], reverse=True)


def _is_enough_at_l2(results: list[dict]) -> bool:
    top = results[0] if results else None
    if not top:
        return False
    return top["score"] >= 0.78 and len(top["item"]["summary"]) >= 24


def _is_enough_at_l1(results: list[dict]) -> bool:
    top = results[0] if results else None
    if not top:
        return False
    return top["score"] >= 0.68 and len(top["item"]["summary"]) >= 20


def _collect_l1_ids_from_l2(results: list[dict]) -> list[str]:
    ids: set[str] = set()
    for hit in results:
        for l1_id in hit["item"]["l1Source"]:
            ids.add(l1_id)
    return list(ids)


def _collect_l0_ids_from_l1(results: list[dict]) -> list[str]:
    ids: set[str] = set()
    for hit in results:
        for l0_id in hit["item"]["l0Source"]:
            ids.add(l0_id)
    return list(ids)


def _render_facts(facts: list[dict]) -> str:
    if not facts:
        return ""
    lines = ["## Dynamic Facts"]
    for fact in facts:
        lines.append(f"- {fact['factKey']}: {truncate(fact['factValue'], 120)} (confidence={fact['confidence']:.2f})")
    return "\n".join(lines)


def _render_l2(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["## L2 Indexes"]
    for hit in results:
        if hit["level"] == "l2_time":
            lines.append(f"- [time:{hit['item']['dateKey']}] {truncate(hit['item']['summary'], 180)}")
        else:
            lines.append(
                f"- [project:{hit['item']['projectName']}] status={hit['item']['currentStatus']} | "
                f"{truncate(hit['item']['latestProgress'], 120)}"
            )
    return "\n".join(lines)


def _render_l1(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["## L1 Windows"]
    for hit in results:
        lines.append(f"- [{hit['item']['timePeriod']}] {truncate(hit['item']['summary'], 180)}")
    return "\n".join(lines)


def _render_l0(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["## L0 Raw Sessions"]
    for hit in results:
        user_messages = [m["content"] for m in hit["item"]["messages"] if m.get("role") == "user"]
        tail = user_messages[-1] if user_messages else ""
        lines.append(f"- [{hit['item']['timestamp']}] {truncate(tail, 180)}")
    return "\n".join(lines)


def _render_context_template(template: str, input_data: dict) -> str:
    content = template
    content = content.replace("{{intent}}", input_data["intent"])
    content = content.replace("{{enoughAt}}", input_data["enoughAt"])
    content = content.replace("{{factsBlock}}", input_data["factsBlock"])
    content = content.replace("{{l2Block}}", input_data["l2Block"])
    content = content.replace("{{l1Block}}", input_data["l1Block"])
    content = content.replace("{{l0Block}}", input_data["l0Block"])
    return content.strip()


class ReasoningRetriever:
    def __init__(self, repository, skills: dict):
        self.repository = repository
        self.skills = skills

    def search_l2(self, query: str, intent: str, limit: int) -> list[dict]:
        if intent == "time":
            return _sort_by_score_desc(self.repository.search_l2_time_indexes(query, limit))[:limit]
        if intent == "project":
            return _sort_by_score_desc(self.repository.search_l2_project_indexes(query, limit))[:limit]
        merged = _sort_by_score_desc(
            [
                *self.repository.search_l2_project_indexes(query, limit),
                *self.repository.search_l2_time_indexes(query, limit),
            ]
        )
        return merged[:limit]

    def search_l1(self, query: str, related_l1_ids: list[str], limit: int) -> list[dict]:
        id_hits = self.repository.get_l1_by_ids(related_l1_ids)
        query_hits = self.repository.search_l1(query, limit)
        merged: dict[str, dict] = {}
        for hit in _normalize_scored_l1(query, [*id_hits, *query_hits]):
            existing = merged.get(hit["item"]["l1IndexId"])
            if not existing or existing["score"] < hit["score"]:
                merged[hit["item"]["l1IndexId"]] = hit
        return _sort_by_score_desc(list(merged.values()))[:limit]

    def search_l0(self, query: str, related_l0_ids: list[str], limit: int) -> list[dict]:
        id_hits = self.repository.get_l0_by_ids(related_l0_ids)
        query_hits = self.repository.search_l0(query, limit)
        merged: dict[str, dict] = {}
        for hit in _normalize_scored_l0(query, [*id_hits, *query_hits]):
            existing = merged.get(hit["item"]["l0IndexId"])
            if not existing or existing["score"] < hit["score"]:
                merged[hit["item"]["l0IndexId"]] = hit
        return _sort_by_score_desc(list(merged.values()))[:limit]

    def retrieve(self, query: str, options: dict | None = None) -> dict:
        opts = options or {}
        intent = classify_intent(query, self.skills)
        l2_limit = int(opts.get("l2Limit", 6))
        l1_limit = int(opts.get("l1Limit", 6))
        l0_limit = int(opts.get("l0Limit", 4))

        l2_results = self.search_l2(query, intent, l2_limit)
        related_l1_ids = _collect_l1_ids_from_l2(l2_results)
        enough_l2 = _is_enough_at_l2(l2_results)

        l1_results: list[dict] = []
        l0_results: list[dict] = []
        enough_at = "none"

        if enough_l2:
            enough_at = "l2"
        else:
            l1_results = self.search_l1(query, related_l1_ids, l1_limit)
            enough_l1 = _is_enough_at_l1(l1_results)
            if enough_l1:
                enough_at = "l1"
            else:
                related_l0_ids = _collect_l0_ids_from_l1(l1_results)
                l0_results = self.search_l0(query, related_l0_ids, l0_limit)
                enough_at = "l0" if l0_results else "none"

        facts = [] if opts.get("includeFacts") is False else self.repository.search_facts(query, 5)
        context = _render_context_template(
            self.skills["contextTemplate"],
            {
                "intent": intent,
                "enoughAt": enough_at,
                "factsBlock": _render_facts(facts),
                "l2Block": _render_l2(l2_results),
                "l1Block": _render_l1(l1_results),
                "l0Block": _render_l0(l0_results),
            },
        )
        return {
            "query": query,
            "intent": intent,
            "enoughAt": enough_at,
            "l2Results": l2_results,
            "l1Results": l1_results,
            "l0Results": l0_results,
            "context": context,
        }
