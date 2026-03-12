from __future__ import annotations

import hashlib
from datetime import datetime, timezone


def hash_text(input_text: str) -> str:
    return hashlib.sha1(input_text.encode("utf-8")).hexdigest()[:10]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_l0_index_id(session_key: str, timestamp: str, payload: str) -> str:
    key = session_key or "session"
    return f"{key}_{hash_text(f'{timestamp}:{payload}')}_raw"


def build_l1_index_id(timestamp: str, source_ids: list[str]) -> str:
    joined = ",".join(sorted(source_ids))
    return f"l1_{hash_text(f'{timestamp}:{joined}')}"


def build_l2_time_index_id(date_key: str) -> str:
    return f"time_{hash_text(date_key)}"


def build_l2_project_index_id(project_name: str) -> str:
    return f"project_{hash_text(project_name.lower())}"


def build_fact_id(fact_key: str) -> str:
    return f"fact_{hash_text(fact_key.lower())}"


def build_link_id(from_level: str, from_id: str, to_level: str, to_id: str) -> str:
    return f"link_{hash_text(f'{from_level}:{from_id}->{to_level}:{to_id}')}"
