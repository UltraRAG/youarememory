from __future__ import annotations

from .utils_id import build_l2_project_index_id, build_l2_time_index_id, now_iso


def _parse_date_key(time_period: str) -> str:
    idx = time_period.find(":")
    return time_period[:idx] if idx >= 0 else time_period


def _derive_project_status(summary: str, skills: dict) -> str:
    lower = summary.lower()
    for rule in skills["projectStatusRules"]["rules"]:
        for keyword in rule["keywords"]:
            if keyword.lower() in lower:
                return rule["status"]
    return skills["projectStatusRules"]["defaultStatus"]


def build_l2_time_from_l1(l1: dict) -> dict:
    date_key = _parse_date_key(l1["timePeriod"])
    now = now_iso()
    return {
        "l2IndexId": build_l2_time_index_id(date_key),
        "dateKey": date_key,
        "summary": l1["summary"],
        "l1Source": [l1["l1IndexId"]],
        "createdAt": now,
        "updatedAt": now,
    }


def build_l2_projects_from_l1(l1: dict, skills: dict) -> list[dict]:
    now = now_iso()
    result: list[dict] = []
    for project_name in l1["projectTags"]:
        result.append(
            {
                "l2IndexId": build_l2_project_index_id(project_name),
                "projectName": project_name,
                "summary": f"{project_name}：{l1['summary']}",
                "currentStatus": _derive_project_status(l1["summary"], skills),
                "latestProgress": l1["situationTimeInfo"],
                "l1Source": [l1["l1IndexId"]],
                "createdAt": now,
                "updatedAt": now,
            }
        )
    return result
