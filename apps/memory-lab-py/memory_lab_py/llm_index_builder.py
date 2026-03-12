from __future__ import annotations

import json
import re
import time
from datetime import datetime
from typing import Any, Callable

from .utils_id import build_l1_index_id, build_l2_project_index_id, build_l2_time_index_id, now_iso
from .utils_text import normalize_text, truncate


def _build_time_period(timestamp: str) -> str:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        return "unknown"
    day = dt.date().isoformat()
    start_hour = dt.hour - (dt.hour % 2)
    end_hour = start_hour + 2
    return f"{day}:T{start_hour:02d}:00-{min(end_hour, 24):02d}:00"


def _parse_date_key(time_period: str) -> str:
    idx = time_period.find(":")
    return time_period[:idx] if idx >= 0 else time_period


def _extract_json_payload(raw_text: str) -> dict[str, Any]:
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("LLM 返回为空")
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass

    fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, flags=re.IGNORECASE)
    if fence_match:
        payload = json.loads(fence_match.group(1))
        if isinstance(payload, dict):
            return payload

    obj_match = re.search(r"(\{[\s\S]*\})", text)
    if obj_match:
        payload = json.loads(obj_match.group(1))
        if isinstance(payload, dict):
            return payload

    raise ValueError("LLM 返回中找不到可解析 JSON 对象")


def _call_llm_for_json(
    llm_callable: Callable[..., dict[str, Any]],
    *,
    system_prompt: str,
    user_prompt: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    started = time.time()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    output = llm_callable(messages=messages)
    elapsed_ms = int((time.time() - started) * 1000)
    answer = str(output.get("answer", "")).strip()
    parsed = _extract_json_payload(answer)
    trace = {
        "request": output.get("request", {}),
        "response": output.get("response", {}),
        "latencyMs": elapsed_ms,
        "answerPreview": truncate(answer, 260),
    }
    return parsed, trace


def _normalize_project_tags(raw_tags: Any) -> list[str]:
    if not isinstance(raw_tags, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_tags:
        text = normalize_text(str(item))
        if not text:
            continue
        if text.lower() in seen:
            continue
        seen.add(text.lower())
        normalized.append(text[:64])
    return normalized[:8]


def _normalize_facts(raw_facts: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_facts, list):
        return []
    facts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_facts:
        if not isinstance(item, dict):
            continue
        value = normalize_text(str(item.get("factValue", "")))
        key = normalize_text(str(item.get("factKey", "")))
        if not value:
            continue
        if not key:
            key = f"fact:{value[:64].lower()}"
        key_lower = key.lower()
        if key_lower in seen:
            continue
        seen.add(key_lower)
        confidence_raw = item.get("confidence", 0.75)
        try:
            confidence = float(confidence_raw)
        except Exception:
            confidence = 0.75
        facts.append(
            {
                "factKey": key[:120],
                "factValue": value[:240],
                "confidence": max(0.1, min(1.0, confidence)),
            }
        )
    return facts[:32]


def build_l1_from_l0_with_llm(
    l0_record: dict[str, Any],
    llm_callable: Callable[..., dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    prompt = (
        "你是记忆索引构建器。请基于给定的会话日志，输出严格 JSON（不要 markdown/不要解释）。\n"
        "必须字段：\n"
        "{\n"
        '  "timePeriod": "YYYY-MM-DD:T16:00-18:00",\n'
        '  "summary": "会话摘要",\n'
        '  "situationTimeInfo": "用户在做什么",\n'
        '  "projectTags": ["项目A", "项目B"],\n'
        '  "facts": [{"factKey":"key","factValue":"value","confidence":0.8}]\n'
        "}\n"
        "要求：仅保留客观事实，不要编造。"
    )
    content = {
        "timestamp": l0_record.get("timestamp"),
        "messages": l0_record.get("messages", []),
        "l0IndexId": l0_record.get("l0IndexId"),
    }
    parsed, llm_trace = _call_llm_for_json(
        llm_callable,
        system_prompt="你是结构化记忆索引专家。",
        user_prompt=f"{prompt}\n\n输入：\n{json.dumps(content, ensure_ascii=False)}",
    )

    time_period = normalize_text(str(parsed.get("timePeriod", ""))) or _build_time_period(str(l0_record.get("timestamp", "")))
    summary = normalize_text(str(parsed.get("summary", "")))
    if not summary:
        raise ValueError("LLM 未返回有效 L1 summary")
    situation = normalize_text(str(parsed.get("situationTimeInfo", ""))) or truncate(summary, 160)
    project_tags = _normalize_project_tags(parsed.get("projectTags", []))
    facts = _normalize_facts(parsed.get("facts", []))
    l0_index_id = str(l0_record["l0IndexId"])
    l1_index_id = build_l1_index_id(str(l0_record.get("timestamp", "")), [l0_index_id])
    l1 = {
        "l1IndexId": l1_index_id,
        "timePeriod": time_period,
        "summary": summary,
        "facts": facts,
        "situationTimeInfo": situation,
        "projectTags": project_tags,
        "l0Source": [l0_index_id],
        "createdAt": now_iso(),
    }
    return l1, llm_trace


def build_l2_time_from_l1_with_llm(
    l1: dict[str, Any],
    llm_callable: Callable[..., dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    prompt = (
        "请基于 L1 结构化窗口构建时间维度 L2。输出严格 JSON：\n"
        '{ "dateKey":"YYYY-MM-DD", "summary":"这一天用户活动摘要" }\n'
        "不要输出其他字段。"
    )
    parsed, llm_trace = _call_llm_for_json(
        llm_callable,
        system_prompt="你是时间维度记忆索引专家。",
        user_prompt=f"{prompt}\n\n输入：\n{json.dumps(l1, ensure_ascii=False)}",
    )
    date_key = normalize_text(str(parsed.get("dateKey", ""))) or _parse_date_key(str(l1.get("timePeriod", "")))
    summary = normalize_text(str(parsed.get("summary", ""))) or normalize_text(str(l1.get("summary", "")))
    if not date_key:
        raise ValueError("LLM 未返回有效 L2 时间 dateKey")
    if not summary:
        raise ValueError("LLM 未返回有效 L2 时间 summary")
    now = now_iso()
    l2_time = {
        "l2IndexId": build_l2_time_index_id(date_key),
        "dateKey": date_key,
        "summary": summary,
        "l1Source": [str(l1["l1IndexId"])],
        "createdAt": now,
        "updatedAt": now,
    }
    return l2_time, llm_trace


def build_l2_projects_from_l1_with_llm(
    l1: dict[str, Any],
    llm_callable: Callable[..., dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    prompt = (
        "请基于 L1 结构化窗口构建项目维度 L2。输出严格 JSON：\n"
        '{ "projects":[{"projectName":"名称","summary":"摘要","currentStatus":"状态","latestProgress":"最新进展"}] }\n'
        "若无法识别项目，可返回空数组。"
    )
    parsed, llm_trace = _call_llm_for_json(
        llm_callable,
        system_prompt="你是项目维度记忆索引专家。",
        user_prompt=f"{prompt}\n\n输入：\n{json.dumps(l1, ensure_ascii=False)}",
    )
    raw_projects = parsed.get("projects", [])
    if not isinstance(raw_projects, list):
        raw_projects = []
    now = now_iso()
    projects: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_projects:
        if not isinstance(item, dict):
            continue
        project_name = normalize_text(str(item.get("projectName", "")))
        if not project_name:
            continue
        key = project_name.lower()
        if key in seen:
            continue
        seen.add(key)
        summary = normalize_text(str(item.get("summary", ""))) or f"{project_name}：{l1.get('summary', '')}"
        current_status = normalize_text(str(item.get("currentStatus", ""))) or "active"
        latest_progress = normalize_text(str(item.get("latestProgress", ""))) or str(l1.get("situationTimeInfo", ""))
        projects.append(
            {
                "l2IndexId": build_l2_project_index_id(project_name),
                "projectName": project_name[:80],
                "summary": summary[:800],
                "currentStatus": current_status[:80],
                "latestProgress": latest_progress[:240],
                "l1Source": [str(l1["l1IndexId"])],
                "createdAt": now,
                "updatedAt": now,
            }
        )
    return projects, llm_trace


def merge_global_facts_with_llm(
    l1: dict[str, Any],
    existing_facts: list[dict[str, Any]],
    llm_callable: Callable[..., dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    prompt = (
        "你要更新用户全局画像 facts。请合并 existingFacts 与 newFacts，输出严格 JSON：\n"
        '{ "facts":[{"factKey":"key","factValue":"value","confidence":0.8}] }\n'
        "要求：去重、保留高置信、避免空值。"
    )
    payload = {
        "existingFacts": existing_facts[:120],
        "newFacts": l1.get("facts", []),
        "l1Summary": l1.get("summary", ""),
    }
    parsed, llm_trace = _call_llm_for_json(
        llm_callable,
        system_prompt="你是用户画像事实合并专家。",
        user_prompt=f"{prompt}\n\n输入：\n{json.dumps(payload, ensure_ascii=False)}",
    )
    merged = _normalize_facts(parsed.get("facts", []))
    return merged, llm_trace
