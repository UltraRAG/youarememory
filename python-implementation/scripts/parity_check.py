#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

APP_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = APP_DIR.parents[0]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from memory_lab_py import MemoryRepository, ReasoningRetriever, load_skills_runtime  # noqa: E402


def _default_db_path() -> str:
    return str((Path.home() / ".openclaw" / "youarememory" / "memory.sqlite").resolve())


def _default_skills_dir() -> str:
    return str((REPO_ROOT / "packages" / "openclaw-memory-plugin" / "skills").resolve())


def _default_ts_debug_script() -> str:
    return str((REPO_ROOT / "packages" / "openclaw-memory-plugin" / "scripts" / "debug-retrieve.mjs").resolve())


def _extract_l2_ids(results: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    for hit in results:
        item = hit.get("item", {})
        value = item.get("l2IndexId")
        if isinstance(value, str):
            ids.append(value)
    return ids


def _extract_l1_ids(results: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    for hit in results:
        item = hit.get("item", {})
        value = item.get("l1IndexId")
        if isinstance(value, str):
            ids.append(value)
    return ids


def _extract_l0_ids(results: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    for hit in results:
        item = hit.get("item", {})
        value = item.get("l0IndexId")
        if isinstance(value, str):
            ids.append(value)
    return ids


def _top_or_empty(values: list[str]) -> str:
    return values[0] if values else ""


def _run_python_result(db_path: str, skills_dir: str, query: str, limit: int, include_facts: bool) -> dict[str, Any]:
    class _SilentLogger:
        @staticmethod
        def info(*_args, **_kwargs):
            return None

        @staticmethod
        def warn(*_args, **_kwargs):
            return None

    repository = MemoryRepository(db_path)
    try:
        skills = load_skills_runtime(skills_dir=skills_dir, logger=_SilentLogger())
        retriever = ReasoningRetriever(repository, skills)
        result = retriever.retrieve(
            query,
            {
                "l2Limit": limit,
                "l1Limit": limit,
                "l0Limit": max(3, int(limit / 2)),
                "includeFacts": include_facts,
            },
        )
        return {"ok": True, "source": "python-memory-lab", "result": result}
    finally:
        repository.close()


def _run_ts_result(
    node_cmd: str,
    ts_debug_script: str,
    db_path: str,
    skills_dir: str,
    query: str,
    limit: int,
    include_facts: bool,
) -> dict[str, Any]:
    command = [
        node_cmd,
        ts_debug_script,
        "--db",
        db_path,
        "--query",
        query,
        "--limit",
        str(limit),
        "--skills-dir",
        skills_dir,
        "--include-facts",
        "true" if include_facts else "false",
    ]
    proc = subprocess.run(command, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "TS debug entry failed\n"
            f"command: {' '.join(command)}\n"
            f"exit_code: {proc.returncode}\n"
            f"stdout: {proc.stdout}\n"
            f"stderr: {proc.stderr}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"TS debug entry returned non-JSON output: {exc}\nstdout={proc.stdout}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare Python lab retrieval and TS plugin retrieval on same DB/query.")
    parser.add_argument("--db", default=_default_db_path(), help="SQLite path")
    parser.add_argument("--query", required=True, help="query string")
    parser.add_argument("--limit", type=int, default=6, help="max items per level")
    parser.add_argument("--skills-dir", default=_default_skills_dir(), help="skills directory")
    parser.add_argument("--node-cmd", default="node", help="node executable")
    parser.add_argument("--ts-debug-script", default=_default_ts_debug_script(), help="TS debug retrieve script path")
    parser.add_argument("--include-facts", action="store_true", help="include facts in retrieve")
    parser.add_argument("--strict", action="store_true", help="require full id list equality per level")
    args = parser.parse_args()

    py_payload = _run_python_result(args.db, args.skills_dir, args.query, args.limit, args.include_facts)
    ts_payload = _run_ts_result(
        args.node_cmd,
        args.ts_debug_script,
        args.db,
        args.skills_dir,
        args.query,
        args.limit,
        args.include_facts,
    )

    py_result = py_payload["result"]
    ts_result = ts_payload["result"]

    py_l2_ids = _extract_l2_ids(py_result["l2Results"])
    py_l1_ids = _extract_l1_ids(py_result["l1Results"])
    py_l0_ids = _extract_l0_ids(py_result["l0Results"])
    ts_l2_ids = _extract_l2_ids(ts_result["l2Results"])
    ts_l1_ids = _extract_l1_ids(ts_result["l1Results"])
    ts_l0_ids = _extract_l0_ids(ts_result["l0Results"])

    checks = {
        "intent": py_result["intent"] == ts_result["intent"],
        "enoughAt": py_result["enoughAt"] == ts_result["enoughAt"],
        "l2TopId": _top_or_empty(py_l2_ids) == _top_or_empty(ts_l2_ids),
        "l1TopId": _top_or_empty(py_l1_ids) == _top_or_empty(ts_l1_ids),
        "l0TopId": _top_or_empty(py_l0_ids) == _top_or_empty(ts_l0_ids),
    }
    if args.strict:
        checks["l2List"] = py_l2_ids == ts_l2_ids
        checks["l1List"] = py_l1_ids == ts_l1_ids
        checks["l0List"] = py_l0_ids == ts_l0_ids

    success = all(checks.values())
    report = {
        "ok": success,
        "strict": args.strict,
        "checks": checks,
        "query": args.query,
        "limit": args.limit,
        "python": {
            "intent": py_result["intent"],
            "enoughAt": py_result["enoughAt"],
            "l2Ids": py_l2_ids,
            "l1Ids": py_l1_ids,
            "l0Ids": py_l0_ids,
        },
        "ts": {
            "intent": ts_result["intent"],
            "enoughAt": ts_result["enoughAt"],
            "l2Ids": ts_l2_ids,
            "l1Ids": ts_l1_ids,
            "l0Ids": ts_l0_ids,
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if success else 2


if __name__ == "__main__":
    raise SystemExit(main())
