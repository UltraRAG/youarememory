from __future__ import annotations

import json
from typing import Any, Callable

from .llm_index_builder import (
    build_l1_from_l0_with_llm,
    build_l2_projects_from_l1_with_llm,
    build_l2_time_from_l1_with_llm,
    merge_global_facts_with_llm,
)
from .openai_backend import call_openai_compatible_chat
from .utils_id import build_l0_index_id, now_iso


class HeartbeatIndexer:
    def __init__(
        self,
        repository,
        skills: dict,
        batch_size: int = 30,
        source: str = "openclaw",
        index_build_config: dict[str, Any] | None = None,
    ):
        self.repository = repository
        self.skills = skills
        self.batch_size = batch_size
        self.source = source
        self.index_build_config = index_build_config or {}

    def _build_index_llm_callable(self) -> Callable[..., dict[str, Any]] | None:
        cfg = self.index_build_config
        if not cfg.get("enabled", True):
            return None
        base_url = str(cfg.get("base_url", "")).strip()
        model = str(cfg.get("model", "")).strip()
        if not base_url or not model:
            return None
        api_key = str(cfg.get("api_key", "")).strip()
        temperature = float(cfg.get("temperature", 0.2))
        max_tokens = int(cfg.get("max_tokens", 1200))
        timeout_seconds = int(cfg.get("timeout_seconds", 60))
        extra_body = cfg.get("extra_body")

        def _call(*, messages: list[dict[str, str]], **_kwargs) -> dict[str, Any]:
            return call_openai_compatible_chat(
                base_url=base_url,
                api_key=api_key,
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                extra_body=extra_body if isinstance(extra_body, dict) else None,
            )

        return _call

    def _llm_config_summary(self) -> dict[str, Any]:
        cfg = self.index_build_config
        return {
            "enabled": bool(cfg.get("enabled", True)),
            "baseUrl": str(cfg.get("base_url", "")),
            "model": str(cfg.get("model", "")),
            "temperature": float(cfg.get("temperature", 0.2)),
            "maxTokens": int(cfg.get("max_tokens", 1200)),
            "timeoutSeconds": int(cfg.get("timeout_seconds", 60)),
        }

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

    def run_heartbeat_with_trace(self) -> dict:
        pending = self.repository.list_unindexed_l0_sessions(self.batch_size)
        indexed_ids: list[str] = []
        failed_ids: list[str] = []
        stats = {
            "l0Captured": len(pending),
            "l1Created": 0,
            "l2TimeUpdated": 0,
            "l2ProjectUpdated": 0,
            "factsUpdated": 0,
            "l0Failed": 0,
        }
        trace_steps: list[dict] = []
        index_llm_callable = self._build_index_llm_callable()

        for l0 in pending:
            step: dict[str, Any] = {
                "sourceL0": {
                    "l0IndexId": l0["l0IndexId"],
                    "sessionKey": l0["sessionKey"],
                    "timestamp": l0["timestamp"],
                },
                "status": "success",
            }
            try:
                if index_llm_callable is None:
                    raise ValueError("索引构建模型未配置。请在侧边栏填写 Base URL 与模型名。")

                l1, l1_llm_trace = build_l1_from_l0_with_llm(l0, index_llm_callable)
                l2_time, l2_time_llm_trace = build_l2_time_from_l1_with_llm(l1, index_llm_callable)
                l2_projects, l2_project_llm_trace = build_l2_projects_from_l1_with_llm(l1, index_llm_callable)
                existing_facts = self.repository.list_global_facts(200)
                merged_facts, facts_llm_trace = merge_global_facts_with_llm(l1, existing_facts, index_llm_callable)

                # 仅在模型链路全部成功后落库，避免半成品。
                self.repository.insert_l1_window(l1)
                self.repository.insert_link("l1", l1["l1IndexId"], "l0", l0["l0IndexId"])
                self.repository.upsert_l2_time_index(l2_time)
                self.repository.insert_link("l2", l2_time["l2IndexId"], "l1", l1["l1IndexId"])
                for l2_project in l2_projects:
                    self.repository.upsert_l2_project_index(l2_project)
                    self.repository.insert_link("l2", l2_project["l2IndexId"], "l1", l1["l1IndexId"])
                self.repository.upsert_global_facts(merged_facts, l1["l1IndexId"])

                stats["l1Created"] += 1
                stats["l2TimeUpdated"] += 1
                stats["l2ProjectUpdated"] += len(l2_projects)
                stats["factsUpdated"] += len(merged_facts)
                indexed_ids.append(l0["l0IndexId"])

                step["l1Build"] = {
                    "l1IndexId": l1["l1IndexId"],
                    "timePeriod": l1["timePeriod"],
                    "projectTags": l1["projectTags"],
                    "factCount": len(l1["facts"]),
                    "llmTrace": l1_llm_trace,
                }
                step["l2TimeBuild"] = {
                    "l2IndexId": l2_time["l2IndexId"],
                    "dateKey": l2_time["dateKey"],
                    "llmTrace": l2_time_llm_trace,
                }
                step["l2ProjectBuild"] = {
                    "count": len(l2_projects),
                    "projects": [
                        {
                            "l2IndexId": project["l2IndexId"],
                            "projectName": project["projectName"],
                            "currentStatus": project["currentStatus"],
                        }
                        for project in l2_projects
                    ],
                    "llmTrace": l2_project_llm_trace,
                }
                step["factsBuild"] = {
                    "count": len(merged_facts),
                    "llmTrace": facts_llm_trace,
                }
            except Exception as error:
                stats["l0Failed"] += 1
                failed_ids.append(l0["l0IndexId"])
                step["status"] = "failed"
                step["error"] = str(error)
            trace_steps.append(step)

        self.repository.mark_l0_indexed(indexed_ids)
        if indexed_ids:
            self.repository.set_pipeline_state("lastIndexedAt", now_iso())
        return {
            "stats": stats,
            "trace": {
                "llmConfig": self._llm_config_summary(),
                "pendingL0Count": len(pending),
                "pendingL0Ids": [item["l0IndexId"] for item in pending],
                "processedL0Ids": indexed_ids,
                "failedL0Ids": failed_ids,
                "steps": trace_steps,
            },
        }

    def run_heartbeat(self) -> dict:
        return self.run_heartbeat_with_trace()["stats"]
