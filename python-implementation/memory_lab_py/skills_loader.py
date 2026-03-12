from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

DEFAULT_INTENT_RULES: dict[str, list[str]] = {
    "timeKeywords": ["今天", "昨天", "最近", "本周", "时间", "日期", "timeline", "when", "day"],
    "projectKeywords": ["项目", "进展", "里程碑", "roadmap", "project", "status", "ultrarag"],
    "factKeywords": ["偏好", "事实", "画像", "profile", "fact", "习惯", "喜欢", "不喜欢"],
}

DEFAULT_EXTRACTION_RULES: dict[str, Any] = {
    "projectPatterns": [
        {"pattern": r"(?:项目|project)\s*[:：]?\s*([A-Za-z][A-Za-z0-9_-]{1,48})", "flags": "gi"},
        {"pattern": r"\b([A-Z][A-Za-z0-9]+(?:[A-Z][A-Za-z0-9]+)+)\b", "flags": "g"},
    ],
    "factRules": [
        {
            "name": "techStack",
            "pattern": r"(?:我在用|我使用|使用的是|技术栈是)\s*([A-Za-z0-9.+#_-]{2,40})",
            "flags": "gi",
            "keyPrefix": "tech",
            "confidence": 0.82,
            "maxLength": 120,
        },
        {
            "name": "activity",
            "pattern": r"(?:我正在|我在)\s*([^，。,.!?]{2,60})",
            "flags": "gi",
            "keyPrefix": "activity",
            "confidence": 0.68,
            "maxLength": 120,
        },
        {
            "name": "preference",
            "pattern": r"(?:喜欢|偏好)\s*([^，。,.!?]{2,40})",
            "flags": "gi",
            "keyPrefix": "preference",
            "confidence": 0.72,
            "maxLength": 120,
        },
        {
            "name": "plan",
            "pattern": r"(?:计划|准备)\s*([^，。,.!?]{2,40})",
            "flags": "gi",
            "keyPrefix": "plan",
            "confidence": 0.65,
            "maxLength": 120,
        },
    ],
    "maxProjectTags": 8,
    "maxFacts": 16,
    "projectTagMinLength": 2,
    "projectTagMaxLength": 50,
    "summaryLimits": {
        "head": 80,
        "tail": 80,
        "assistant": 80,
    },
}

DEFAULT_PROJECT_STATUS_RULES: dict[str, Any] = {
    "defaultStatus": "in_progress",
    "rules": [
        {"status": "completed", "keywords": ["完成", "done", "已上线"]},
        {"status": "blocked", "keywords": ["阻塞", "失败", "报错"]},
        {"status": "planning", "keywords": ["计划", "准备"]},
    ],
}

DEFAULT_CONTEXT_TEMPLATE = """You are using multi-level memory indexes for this turn.
intent={{intent}}
enoughAt={{enoughAt}}

{{factsBlock}}

{{l2Block}}

{{l1Block}}

{{l0Block}}

Only use the above as supporting context; prioritize the user's latest request."""


def _resolve_default_skills_dir() -> Path:
    current_file = Path(__file__).resolve()
    repo_root = current_file.parents[2]
    return repo_root / "packages" / "openclaw-memory-plugin" / "skills"


def _read_json_with_fallback(path: Path, fallback: Any, errors: list[str]) -> Any:
    if not path.exists():
        errors.append(f"missing file: {path}")
        return copy.deepcopy(fallback)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        errors.append(f"invalid json: {path}")
        return copy.deepcopy(fallback)


def _ensure_keywords(values: Any, fallback: list[str]) -> list[str]:
    if not isinstance(values, list):
        return fallback
    cleaned = [str(v).strip() for v in values if isinstance(v, str) and str(v).strip()]
    return cleaned if cleaned else fallback


def _flags_from_js(flag_string: str | None) -> int:
    if not flag_string:
        return 0
    flags = 0
    if "i" in flag_string:
        flags |= re.IGNORECASE
    if "m" in flag_string:
        flags |= re.MULTILINE
    if "s" in flag_string:
        flags |= re.DOTALL
    return flags


def _compile_pattern(pattern: str, flag_string: str | None, fallback_pattern: str, fallback_flags: str | None) -> re.Pattern[str]:
    try:
        return re.compile(pattern, _flags_from_js(flag_string))
    except Exception:
        return re.compile(fallback_pattern, _flags_from_js(fallback_flags))


def _normalize_intent_rules(input_rules: dict[str, Any]) -> dict[str, list[str]]:
    return {
        "timeKeywords": _ensure_keywords(input_rules.get("timeKeywords"), DEFAULT_INTENT_RULES["timeKeywords"]),
        "projectKeywords": _ensure_keywords(input_rules.get("projectKeywords"), DEFAULT_INTENT_RULES["projectKeywords"]),
        "factKeywords": _ensure_keywords(input_rules.get("factKeywords"), DEFAULT_INTENT_RULES["factKeywords"]),
    }


def _normalize_extraction_rules(input_rules: dict[str, Any]) -> dict[str, Any]:
    default_project_patterns = DEFAULT_EXTRACTION_RULES["projectPatterns"]
    raw_project_patterns = input_rules.get("projectPatterns")
    if not isinstance(raw_project_patterns, list) or len(raw_project_patterns) == 0:
        raw_project_patterns = default_project_patterns
    project_patterns: list[re.Pattern[str]] = []
    for index, item in enumerate(raw_project_patterns):
        fallback = default_project_patterns[index] if index < len(default_project_patterns) else default_project_patterns[0]
        if not isinstance(item, dict):
            item = {}
        project_patterns.append(
            _compile_pattern(
                str(item.get("pattern", fallback["pattern"])),
                item.get("flags"),
                fallback["pattern"],
                fallback.get("flags"),
            )
        )

    default_fact_rules = DEFAULT_EXTRACTION_RULES["factRules"]
    raw_fact_rules = input_rules.get("factRules")
    if not isinstance(raw_fact_rules, list) or len(raw_fact_rules) == 0:
        raw_fact_rules = default_fact_rules

    fact_rules: list[dict[str, Any]] = []
    for index, item in enumerate(raw_fact_rules):
        fallback = default_fact_rules[index] if index < len(default_fact_rules) else default_fact_rules[0]
        if not isinstance(item, dict):
            item = {}
        name = str(item.get("name") or fallback["name"] or f"rule_{index}")
        pattern = str(item.get("pattern") or fallback["pattern"])
        flags = item.get("flags")
        regex = _compile_pattern(pattern, flags, fallback["pattern"], fallback.get("flags"))
        confidence = item.get("confidence")
        max_length = item.get("maxLength")
        fact_rules.append(
            {
                "name": name,
                "regex": regex,
                "keyPrefix": str(item.get("keyPrefix") or fallback["keyPrefix"]),
                "confidence": float(confidence) if isinstance(confidence, (int, float)) else float(fallback["confidence"]),
                "maxLength": int(max_length) if isinstance(max_length, (int, float)) else int(fallback.get("maxLength", 120)),
            }
        )

    summary_limits = input_rules.get("summaryLimits")
    if not isinstance(summary_limits, dict):
        summary_limits = DEFAULT_EXTRACTION_RULES["summaryLimits"]

    return {
        "projectPatterns": project_patterns,
        "factRules": fact_rules,
        "maxProjectTags": int(input_rules.get("maxProjectTags")) if isinstance(input_rules.get("maxProjectTags"), (int, float)) else int(DEFAULT_EXTRACTION_RULES["maxProjectTags"]),
        "maxFacts": int(input_rules.get("maxFacts")) if isinstance(input_rules.get("maxFacts"), (int, float)) else int(DEFAULT_EXTRACTION_RULES["maxFacts"]),
        "projectTagMinLength": int(input_rules.get("projectTagMinLength")) if isinstance(input_rules.get("projectTagMinLength"), (int, float)) else int(DEFAULT_EXTRACTION_RULES["projectTagMinLength"]),
        "projectTagMaxLength": int(input_rules.get("projectTagMaxLength")) if isinstance(input_rules.get("projectTagMaxLength"), (int, float)) else int(DEFAULT_EXTRACTION_RULES["projectTagMaxLength"]),
        "summaryLimits": {
            "head": int(summary_limits.get("head", 80)),
            "tail": int(summary_limits.get("tail", 80)),
            "assistant": int(summary_limits.get("assistant", 80)),
        },
    }


def _normalize_project_status_rules(input_rules: dict[str, Any]) -> dict[str, Any]:
    rules = input_rules.get("rules")
    if not isinstance(rules, list):
        rules = DEFAULT_PROJECT_STATUS_RULES["rules"]

    normalized_rules: list[dict[str, Any]] = []
    for index, rule in enumerate(rules):
        fallback = (
            DEFAULT_PROJECT_STATUS_RULES["rules"][index]
            if index < len(DEFAULT_PROJECT_STATUS_RULES["rules"])
            else DEFAULT_PROJECT_STATUS_RULES["rules"][0]
        )
        if not isinstance(rule, dict):
            rule = {}
        status = str(rule.get("status") or fallback["status"])
        keywords = _ensure_keywords(rule.get("keywords"), fallback["keywords"])
        if status and keywords:
            normalized_rules.append({"status": status, "keywords": keywords})

    if not normalized_rules:
        normalized_rules = copy.deepcopy(DEFAULT_PROJECT_STATUS_RULES["rules"])

    return {
        "defaultStatus": str(input_rules.get("defaultStatus") or DEFAULT_PROJECT_STATUS_RULES["defaultStatus"]),
        "rules": normalized_rules,
    }


def load_skills_runtime(skills_dir: str | None = None, logger: Any | None = None) -> dict[str, Any]:
    log = logger or print
    resolved_skills_dir = Path(skills_dir).expanduser().resolve() if skills_dir else _resolve_default_skills_dir()
    errors: list[str] = []

    intent_path = resolved_skills_dir / "intent-rules.json"
    extraction_path = resolved_skills_dir / "extraction-rules.json"
    project_status_path = resolved_skills_dir / "project-status-rules.json"
    context_path = resolved_skills_dir / "context-template.md"

    intent_raw = _read_json_with_fallback(intent_path, DEFAULT_INTENT_RULES, errors)
    extraction_raw = _read_json_with_fallback(extraction_path, DEFAULT_EXTRACTION_RULES, errors)
    project_status_raw = _read_json_with_fallback(project_status_path, DEFAULT_PROJECT_STATUS_RULES, errors)

    context_template = DEFAULT_CONTEXT_TEMPLATE
    if not context_path.exists():
        errors.append(f"missing file: {context_path}")
    else:
        raw = context_path.read_text(encoding="utf-8").strip()
        context_template = raw or DEFAULT_CONTEXT_TEMPLATE

    runtime = {
        "intentRules": _normalize_intent_rules(intent_raw if isinstance(intent_raw, dict) else DEFAULT_INTENT_RULES),
        "extractionRules": _normalize_extraction_rules(extraction_raw if isinstance(extraction_raw, dict) else DEFAULT_EXTRACTION_RULES),
        "projectStatusRules": _normalize_project_status_rules(project_status_raw if isinstance(project_status_raw, dict) else DEFAULT_PROJECT_STATUS_RULES),
        "contextTemplate": context_template,
        "metadata": {
            "source": "fallback" if errors else "files",
            "skillsDir": str(resolved_skills_dir),
            "errors": errors,
        },
    }

    if errors:
        if hasattr(log, "warn"):
            log.warn(f"[youarememory:py] skills loaded with fallback. errors={' | '.join(errors)}")
        else:
            print(f"[youarememory:py] skills loaded with fallback. errors={' | '.join(errors)}")
    else:
        if hasattr(log, "info"):
            log.info(f"[youarememory:py] skills loaded from {resolved_skills_dir}")
        else:
            print(f"[youarememory:py] skills loaded from {resolved_skills_dir}")
    return runtime
