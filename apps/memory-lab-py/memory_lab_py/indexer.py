from __future__ import annotations

import json

from .l1_extractor import extract_l1_from_l0
from .l2_builder import build_l2_projects_from_l1, build_l2_time_from_l1
from .utils_id import build_l0_index_id, now_iso


class HeartbeatIndexer:
    def __init__(self, repository, skills: dict, batch_size: int = 30, source: str = "openclaw"):
        self.repository = repository
        self.skills = skills
        self.batch_size = batch_size
        self.source = source

    def capture_l0_session(self, input_data: dict) -> dict:
        timestamp = str(input_data.get("timestamp") or now_iso())
        payload = json.dumps(input_data["messages"], ensure_ascii=False)
        l0_index_id = build_l0_index_id(str(input_data.get("sessionKey") or "session"), timestamp, payload)
        record = {
            "l0IndexId": l0_index_id,
            "sessionKey": input_data["sessionKey"],
            "timestamp": timestamp,
            "messages": input_data["messages"],
            "source": input_data.get("source") or self.source,
            "indexed": False,
            "createdAt": now_iso(),
        }
        self.repository.insert_l0_session(record)
        return record

    def run_heartbeat(self) -> dict:
        pending = self.repository.list_unindexed_l0_sessions(self.batch_size)
        indexed_ids: list[str] = []
        stats = {
            "l0Captured": len(pending),
            "l1Created": 0,
            "l2TimeUpdated": 0,
            "l2ProjectUpdated": 0,
            "factsUpdated": 0,
        }

        for l0 in pending:
            l1 = extract_l1_from_l0(l0, self.skills)
            self.repository.insert_l1_window(l1)
            self.repository.insert_link("l1", l1["l1IndexId"], "l0", l0["l0IndexId"])
            stats["l1Created"] += 1

            l2_time = build_l2_time_from_l1(l1)
            self.repository.upsert_l2_time_index(l2_time)
            self.repository.insert_link("l2", l2_time["l2IndexId"], "l1", l1["l1IndexId"])
            stats["l2TimeUpdated"] += 1

            l2_projects = build_l2_projects_from_l1(l1, self.skills)
            for l2_project in l2_projects:
                self.repository.upsert_l2_project_index(l2_project)
                self.repository.insert_link("l2", l2_project["l2IndexId"], "l1", l1["l1IndexId"])
                stats["l2ProjectUpdated"] += 1

            self.repository.upsert_global_facts(l1["facts"], l1["l1IndexId"])
            stats["factsUpdated"] += len(l1["facts"])
            indexed_ids.append(l0["l0IndexId"])

        self.repository.mark_l0_indexed(indexed_ids)
        self.repository.set_pipeline_state("lastIndexedAt", now_iso())
        return stats
