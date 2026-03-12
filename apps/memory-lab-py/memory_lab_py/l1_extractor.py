from __future__ import annotations

from datetime import datetime

from .extraction_skill import (
    build_session_summary,
    build_situation_time_info,
    extract_fact_candidates,
    extract_project_tags,
)
from .utils_id import build_l1_index_id, now_iso


def _build_time_period(timestamp: str) -> str:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        return "unknown"
    day = dt.date().isoformat()
    start_hour = dt.hour - (dt.hour % 2)
    end_hour = start_hour + 2
    return f"{day}:T{start_hour:02d}:00-{min(end_hour, 24):02d}:00"


def extract_l1_from_l0(record: dict, skills: dict) -> dict:
    summary = build_session_summary(record["messages"], skills)
    facts = extract_fact_candidates(record["messages"], skills)
    project_tags = extract_project_tags(record["messages"], skills)
    l1_index_id = build_l1_index_id(record["timestamp"], [record["l0IndexId"]])
    return {
        "l1IndexId": l1_index_id,
        "timePeriod": _build_time_period(record["timestamp"]),
        "summary": summary,
        "facts": facts,
        "situationTimeInfo": build_situation_time_info(record["timestamp"], summary),
        "projectTags": project_tags,
        "l0Source": [record["l0IndexId"]],
        "createdAt": now_iso(),
    }
