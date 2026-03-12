from __future__ import annotations

import re
from datetime import datetime

from .utils_text import normalize_text, truncate


def _extract_from_pattern(text: str, pattern: re.Pattern[str]) -> list[str]:
    results: list[str] = []
    for match in pattern.finditer(text):
        value = normalize_text(match.group(1) if match.lastindex else "")
        if value:
            results.append(value)
    return results


def extract_project_tags(messages: list[dict], skills: dict) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    user_text = "\n".join([str(msg.get("content", "")) for msg in messages if str(msg.get("role", "")) == "user"])
    extraction_rules = skills["extractionRules"]
    for pattern in extraction_rules["projectPatterns"]:
        for value in _extract_from_pattern(user_text, pattern):
            cleaned = re.sub(r"[^\w.-]", "", value)
            if (
                len(cleaned) >= extraction_rules["projectTagMinLength"]
                and len(cleaned) <= extraction_rules["projectTagMaxLength"]
                and cleaned not in seen
            ):
                seen.add(cleaned)
                tags.append(cleaned)
    return tags[: extraction_rules["maxProjectTags"]]


def extract_fact_candidates(messages: list[dict], skills: dict) -> list[dict]:
    facts: dict[str, dict] = {}
    user_text = "\n".join([str(msg.get("content", "")) for msg in messages if str(msg.get("role", "")) == "user"])
    extraction_rules = skills["extractionRules"]
    for rule in extraction_rules["factRules"]:
        for value in _extract_from_pattern(user_text, rule["regex"]):
            text = truncate(value, rule["maxLength"])
            key = f"{rule['keyPrefix']}:{text.lower()}"
            facts[key] = {
                "factKey": key,
                "factValue": text,
                "confidence": float(rule["confidence"]),
            }

    for project_name in extract_project_tags(messages, skills):
        key = f"project:{project_name.lower()}"
        facts[key] = {
            "factKey": key,
            "factValue": project_name,
            "confidence": 0.78,
        }
    return list(facts.values())[: extraction_rules["maxFacts"]]


def build_session_summary(messages: list[dict], skills: dict) -> str:
    user_messages = [normalize_text(str(msg.get("content", ""))) for msg in messages if str(msg.get("role", "")) == "user"]
    assistant_messages = [
        normalize_text(str(msg.get("content", ""))) for msg in messages if str(msg.get("role", "")) == "assistant"
    ]

    user_head = user_messages[0] if user_messages else ""
    user_tail = user_messages[-1] if user_messages else ""
    assistant_tail = assistant_messages[-1] if assistant_messages else ""
    limits = skills["extractionRules"]["summaryLimits"]

    parts: list[str] = []
    if user_head:
        parts.append(f"用户提到：{truncate(user_head, limits['head'])}")
    if user_tail and user_tail != user_head:
        parts.append(f"后续重点：{truncate(user_tail, limits['tail'])}")
    if assistant_tail:
        parts.append(f"助手响应：{truncate(assistant_tail, limits['assistant'])}")
    if not parts:
        return "该窗口没有可用文本，跳过结构化摘要。"
    return "；".join(parts)


def build_situation_time_info(timestamp: str, summary: str) -> str:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        return f"未知时间场景：{truncate(summary, 120)}"
    return f"{dt.date().isoformat()} {dt.strftime('%H:%M')} 用户正在推进：{truncate(summary, 120)}"
