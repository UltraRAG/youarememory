from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .utils_id import build_fact_id, build_link_id, now_iso
from .utils_text import safe_json_parse, score_match


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _parse_l0_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = _row_to_dict(row)
    return {
        "l0IndexId": str(payload["l0_index_id"]),
        "sessionKey": str(payload["session_key"]),
        "timestamp": str(payload["timestamp"]),
        "messages": safe_json_parse(str(payload.get("messages_json") or "[]"), []),
        "source": str(payload.get("source") or "openclaw"),
        "indexed": int(payload.get("indexed") or 0) == 1,
        "createdAt": str(payload["created_at"]),
    }


def _parse_l1_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = _row_to_dict(row)
    return {
        "l1IndexId": str(payload["l1_index_id"]),
        "timePeriod": str(payload["time_period"]),
        "summary": str(payload["summary"]),
        "facts": safe_json_parse(str(payload.get("facts_json") or "[]"), []),
        "situationTimeInfo": str(payload.get("situation_time_info") or ""),
        "projectTags": safe_json_parse(str(payload.get("project_tags_json") or "[]"), []),
        "l0Source": safe_json_parse(str(payload.get("l0_source_json") or "[]"), []),
        "createdAt": str(payload["created_at"]),
    }


def _parse_l2_time_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = _row_to_dict(row)
    return {
        "l2IndexId": str(payload["l2_index_id"]),
        "dateKey": str(payload["date_key"]),
        "summary": str(payload["summary"]),
        "l1Source": safe_json_parse(str(payload.get("l1_source_json") or "[]"), []),
        "createdAt": str(payload["created_at"]),
        "updatedAt": str(payload["updated_at"]),
    }


def _parse_l2_project_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = _row_to_dict(row)
    return {
        "l2IndexId": str(payload["l2_index_id"]),
        "projectName": str(payload["project_name"]),
        "summary": str(payload["summary"]),
        "currentStatus": str(payload["current_status"]),
        "latestProgress": str(payload["latest_progress"]),
        "l1Source": safe_json_parse(str(payload.get("l1_source_json") or "[]"), []),
        "createdAt": str(payload["created_at"]),
        "updatedAt": str(payload["updated_at"]),
    }


def _parse_fact_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = _row_to_dict(row)
    record = {
        "factId": str(payload["fact_id"]),
        "factKey": str(payload["fact_key"]),
        "factValue": str(payload["fact_value"]),
        "confidence": float(payload.get("confidence") or 0),
        "createdAt": str(payload["created_at"]),
        "updatedAt": str(payload["updated_at"]),
    }
    source_l1_id = payload.get("source_l1_id")
    if source_l1_id:
        record["sourceL1Id"] = str(source_l1_id)
    return record


def _merge_source_ids(existing: list[str], incoming: list[str]) -> list[str]:
    return list(dict.fromkeys([*existing, *incoming]).keys())


def _merge_summary(existing: str, incoming: str, max_length: int = 800) -> str:
    base = existing.strip()
    add = incoming.strip()
    if not base:
        return add[:max_length]
    if not add:
        return base[:max_length]
    if add in base:
        return base[:max_length]
    return f"{base}\n- {add}"[:max_length]


def _tokenize_query(query: str) -> list[str]:
    trimmed = query.strip()
    if not trimmed:
        return []
    tokens: set[str] = {trimmed}
    for token in __import__("re").split(r"[\s,.;:!?，。！？、]+", trimmed):
        cleaned = token.strip()
        if len(cleaned) >= 2:
            tokens.add(cleaned)
    return list(tokens)


def _compute_token_score(query: str, candidates: list[str]) -> float:
    tokens = _tokenize_query(query)
    if not tokens:
        return 1.0
    best = 0.0
    for text in candidates:
        for token in tokens:
            best = max(best, score_match(token, text))
    return best


class MemoryRepository:
    def __init__(self, db_path: str):
        self.db_path = str(Path(db_path).expanduser())
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode = WAL;")
        self.conn.execute("PRAGMA synchronous = NORMAL;")
        self.conn.execute("PRAGMA temp_store = MEMORY;")
        self.migrate()

    def close(self) -> None:
        self.conn.close()

    def clear_all_memory(self) -> dict[str, Any]:
        before = self.get_overview()
        tables = [
            "index_links",
            "global_facts",
            "l2_project_indexes",
            "l2_time_indexes",
            "l1_windows",
            "l0_sessions",
            "pipeline_state",
        ]
        with self.conn:
            for table in tables:
                self.conn.execute(f"DELETE FROM {table}")
        after = self.get_overview()
        return {"before": before, "after": after}

    def migrate(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS l0_sessions (
              l0_index_id TEXT PRIMARY KEY,
              session_key TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              messages_json TEXT NOT NULL,
              source TEXT NOT NULL,
              indexed INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS l1_windows (
              l1_index_id TEXT PRIMARY KEY,
              time_period TEXT NOT NULL,
              summary TEXT NOT NULL,
              facts_json TEXT NOT NULL,
              situation_time_info TEXT NOT NULL,
              project_tags_json TEXT NOT NULL,
              l0_source_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS l2_time_indexes (
              l2_index_id TEXT PRIMARY KEY,
              date_key TEXT NOT NULL UNIQUE,
              summary TEXT NOT NULL,
              l1_source_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS l2_project_indexes (
              l2_index_id TEXT PRIMARY KEY,
              project_name TEXT NOT NULL UNIQUE,
              summary TEXT NOT NULL,
              current_status TEXT NOT NULL,
              latest_progress TEXT NOT NULL,
              l1_source_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS global_facts (
              fact_id TEXT PRIMARY KEY,
              fact_key TEXT NOT NULL UNIQUE,
              fact_value TEXT NOT NULL,
              confidence REAL NOT NULL,
              source_l1_id TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS index_links (
              link_id TEXT PRIMARY KEY,
              from_level TEXT NOT NULL,
              from_id TEXT NOT NULL,
              to_level TEXT NOT NULL,
              to_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              UNIQUE(from_level, from_id, to_level, to_id)
            );

            CREATE TABLE IF NOT EXISTS pipeline_state (
              state_key TEXT PRIMARY KEY,
              state_value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_l0_session_time ON l0_sessions(session_key, timestamp);
            CREATE INDEX IF NOT EXISTS idx_l0_indexed ON l0_sessions(indexed, timestamp);
            CREATE INDEX IF NOT EXISTS idx_l1_time_period ON l1_windows(time_period);
            CREATE INDEX IF NOT EXISTS idx_l2_time_date ON l2_time_indexes(date_key);
            CREATE INDEX IF NOT EXISTS idx_l2_project_name ON l2_project_indexes(project_name);
            CREATE INDEX IF NOT EXISTS idx_facts_key ON global_facts(fact_key);
            """
        )
        self.conn.commit()

    def insert_l0_session(self, record: dict[str, Any]) -> None:
        created_at = str(record.get("createdAt") or now_iso())
        self.conn.execute(
            """
            INSERT OR IGNORE INTO l0_sessions (
              l0_index_id, session_key, timestamp, messages_json, source, indexed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["l0IndexId"],
                record["sessionKey"],
                record["timestamp"],
                json.dumps(record["messages"], ensure_ascii=False),
                record.get("source", "openclaw"),
                1 if record.get("indexed") else 0,
                created_at,
            ),
        )
        self.conn.commit()

    def list_unindexed_l0_sessions(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM l0_sessions
            WHERE indexed = 0
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [_parse_l0_row(row) for row in rows]

    def count_unindexed_l0_sessions(self) -> int:
        row = self.conn.execute("SELECT COUNT(1) AS total FROM l0_sessions WHERE indexed = 0").fetchone()
        return int(row["total"] if row and row["total"] is not None else 0)

    def mark_l0_indexed(self, ids: list[str]) -> None:
        if not ids:
            return
        placeholders = ", ".join(["?"] * len(ids))
        self.conn.execute(f"UPDATE l0_sessions SET indexed = 1 WHERE l0_index_id IN ({placeholders})", tuple(ids))
        self.conn.commit()

    def get_l0_by_ids(self, ids: list[str]) -> list[dict[str, Any]]:
        if not ids:
            return []
        placeholders = ", ".join(["?"] * len(ids))
        rows = self.conn.execute(
            f"SELECT * FROM l0_sessions WHERE l0_index_id IN ({placeholders}) ORDER BY timestamp DESC",
            tuple(ids),
        ).fetchall()
        return [_parse_l0_row(row) for row in rows]

    def list_recent_l0(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM l0_sessions ORDER BY timestamp DESC LIMIT ?", (limit,)).fetchall()
        return [_parse_l0_row(row) for row in rows]

    def list_distinct_session_keys(self, limit: int = 200) -> list[str]:
        rows = self.conn.execute(
            """
            SELECT session_key, MAX(timestamp) AS last_ts
            FROM l0_sessions
            GROUP BY session_key
            ORDER BY last_ts DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [str(row["session_key"]) for row in rows if row and row["session_key"]]

    def list_l0_by_session_key(self, session_key: str, limit: int = 500) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM l0_sessions
            WHERE session_key = ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (session_key, limit),
        ).fetchall()
        return [_parse_l0_row(row) for row in rows]

    def search_l0(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        rows = self.list_recent_l0(max(50, limit * 10))
        scored = []
        for item in rows:
            score = _compute_token_score(query, [item["sessionKey"], json.dumps(item["messages"], ensure_ascii=False)])
            scored.append({"item": item, "score": score})
        scored = [hit for hit in scored if hit["score"] > 0.2]
        scored.sort(key=lambda x: x["score"], reverse=True)
        return [hit["item"] for hit in scored[:limit]]

    def insert_l1_window(self, window: dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT OR IGNORE INTO l1_windows (
              l1_index_id, time_period, summary, facts_json, situation_time_info, project_tags_json, l0_source_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                window["l1IndexId"],
                window["timePeriod"],
                window["summary"],
                json.dumps(window["facts"], ensure_ascii=False),
                window["situationTimeInfo"],
                json.dumps(window["projectTags"], ensure_ascii=False),
                json.dumps(window["l0Source"], ensure_ascii=False),
                window["createdAt"],
            ),
        )
        self.conn.commit()

    def get_l1_by_ids(self, ids: list[str]) -> list[dict[str, Any]]:
        if not ids:
            return []
        placeholders = ", ".join(["?"] * len(ids))
        rows = self.conn.execute(
            f"SELECT * FROM l1_windows WHERE l1_index_id IN ({placeholders}) ORDER BY created_at DESC",
            tuple(ids),
        ).fetchall()
        return [_parse_l1_row(row) for row in rows]

    def list_recent_l1(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM l1_windows ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [_parse_l1_row(row) for row in rows]

    def search_l1(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.list_recent_l1(max(60, limit * 10))
        scored = []
        for item in rows:
            score = _compute_token_score(
                query,
                [
                    item["summary"],
                    item["situationTimeInfo"],
                    " ".join(item["projectTags"]),
                    json.dumps(item["facts"], ensure_ascii=False),
                ],
            )
            scored.append({"item": item, "score": score})
        scored = [hit for hit in scored if hit["score"] > 0.2]
        scored.sort(key=lambda x: x["score"], reverse=True)
        return [hit["item"] for hit in scored[:limit]]

    def get_l2_time_by_date(self, date_key: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM l2_time_indexes WHERE date_key = ?", (date_key,)).fetchone()
        return _parse_l2_time_row(row) if row else None

    def upsert_l2_time_index(self, index: dict[str, Any]) -> None:
        previous = self.get_l2_time_by_date(index["dateKey"])
        now = now_iso()
        merged_sources = _merge_source_ids(previous["l1Source"] if previous else [], index["l1Source"])
        merged_summary = _merge_summary(previous["summary"] if previous else "", index["summary"])
        self.conn.execute(
            """
            INSERT INTO l2_time_indexes (
              l2_index_id, date_key, summary, l1_source_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(date_key) DO UPDATE SET
              summary = excluded.summary,
              l1_source_json = excluded.l1_source_json,
              updated_at = excluded.updated_at
            """,
            (
                previous["l2IndexId"] if previous else index["l2IndexId"],
                index["dateKey"],
                merged_summary,
                json.dumps(merged_sources, ensure_ascii=False),
                previous["createdAt"] if previous else index["createdAt"],
                now,
            ),
        )
        self.conn.commit()

    def list_recent_l2_time(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM l2_time_indexes ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        return [_parse_l2_time_row(row) for row in rows]

    def search_l2_time_indexes(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.list_recent_l2_time(max(50, limit * 10))
        results = []
        for item in rows:
            results.append(
                {
                    "level": "l2_time",
                    "score": _compute_token_score(query, [item["dateKey"], item["summary"]]),
                    "item": item,
                }
            )
        results = [hit for hit in results if hit["score"] > 0.2]
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def get_l2_project_by_name(self, project_name: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM l2_project_indexes WHERE project_name = ?", (project_name,)).fetchone()
        return _parse_l2_project_row(row) if row else None

    def upsert_l2_project_index(self, index: dict[str, Any]) -> None:
        previous = self.get_l2_project_by_name(index["projectName"])
        now = now_iso()
        merged_sources = _merge_source_ids(previous["l1Source"] if previous else [], index["l1Source"])
        merged_summary = _merge_summary(previous["summary"] if previous else "", index["summary"])
        self.conn.execute(
            """
            INSERT INTO l2_project_indexes (
              l2_index_id, project_name, summary, current_status, latest_progress, l1_source_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_name) DO UPDATE SET
              summary = excluded.summary,
              current_status = excluded.current_status,
              latest_progress = excluded.latest_progress,
              l1_source_json = excluded.l1_source_json,
              updated_at = excluded.updated_at
            """,
            (
                previous["l2IndexId"] if previous else index["l2IndexId"],
                index["projectName"],
                merged_summary,
                index["currentStatus"],
                index["latestProgress"],
                json.dumps(merged_sources, ensure_ascii=False),
                previous["createdAt"] if previous else index["createdAt"],
                now,
            ),
        )
        self.conn.commit()

    def list_recent_l2_projects(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM l2_project_indexes ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        return [_parse_l2_project_row(row) for row in rows]

    def search_l2_project_indexes(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.list_recent_l2_projects(max(50, limit * 10))
        results = []
        for item in rows:
            results.append(
                {
                    "level": "l2_project",
                    "score": _compute_token_score(query, [item["projectName"], item["summary"], item["latestProgress"]]),
                    "item": item,
                }
            )
        results = [hit for hit in results if hit["score"] > 0.2]
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def upsert_global_facts(self, facts: list[dict[str, Any]], source_l1_id: str | None = None) -> None:
        if not facts:
            return
        now = now_iso()
        for fact in facts:
            fact_id = build_fact_id(fact["factKey"])
            self.conn.execute(
                """
                INSERT INTO global_facts (
                  fact_id, fact_key, fact_value, confidence, source_l1_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(fact_key) DO UPDATE SET
                  fact_value = excluded.fact_value,
                  confidence = MAX(excluded.confidence, confidence),
                  source_l1_id = excluded.source_l1_id,
                  updated_at = excluded.updated_at
                """,
                (
                    fact_id,
                    fact["factKey"],
                    fact["factValue"],
                    float(fact.get("confidence", 0)),
                    source_l1_id,
                    now,
                    now,
                ),
            )
        self.conn.commit()

    def list_global_facts(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM global_facts ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        return [_parse_fact_row(row) for row in rows]

    def search_facts(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.list_global_facts(max(60, limit * 8))
        scored = []
        for item in rows:
            score = _compute_token_score(query, [item["factKey"], item["factValue"]])
            scored.append({"item": item, "score": score})
        scored = [hit for hit in scored if hit["score"] > 0.2]
        scored.sort(key=lambda x: x["score"], reverse=True)
        return [hit["item"] for hit in scored[:limit]]

    def insert_link(self, from_level: str, from_id: str, to_level: str, to_id: str) -> None:
        link_id = build_link_id(from_level, from_id, to_level, to_id)
        self.conn.execute(
            """
            INSERT OR IGNORE INTO index_links (link_id, from_level, from_id, to_level, to_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (link_id, from_level, from_id, to_level, to_id, now_iso()),
        )
        self.conn.commit()

    def get_overview(self) -> dict[str, Any]:
        def count(table_name: str) -> int:
            row = self.conn.execute(f"SELECT COUNT(1) AS total FROM {table_name}").fetchone()
            return int(row["total"] if row and row["total"] is not None else 0)

        state = self.conn.execute("SELECT state_value FROM pipeline_state WHERE state_key = ?", ("lastIndexedAt",)).fetchone()
        overview: dict[str, Any] = {
            "totalL0": count("l0_sessions"),
            "totalL1": count("l1_windows"),
            "totalL2Time": count("l2_time_indexes"),
            "totalL2Project": count("l2_project_indexes"),
            "totalFacts": count("global_facts"),
        }
        if state and state["state_value"]:
            overview["lastIndexedAt"] = state["state_value"]
        return overview

    def set_pipeline_state(self, key: str, value: str) -> None:
        now = now_iso()
        self.conn.execute(
            """
            INSERT INTO pipeline_state (state_key, state_value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(state_key) DO UPDATE SET
              state_value = excluded.state_value,
              updated_at = excluded.updated_at
            """,
            (key, value, now),
        )
        self.conn.commit()

    def get_pipeline_state(self, key: str) -> str | None:
        row = self.conn.execute("SELECT state_value FROM pipeline_state WHERE state_key = ?", (key,)).fetchone()
        if not row:
            return None
        value = row["state_value"]
        return str(value) if value is not None else None

    def get_ui_snapshot(self, limit: int = 20) -> dict[str, Any]:
        return {
            "overview": self.get_overview(),
            "recentTimeIndexes": self.list_recent_l2_time(limit),
            "recentProjectIndexes": self.list_recent_l2_projects(limit),
            "recentFacts": self.list_global_facts(limit),
            "recentSessions": self.list_recent_l0(limit),
        }
