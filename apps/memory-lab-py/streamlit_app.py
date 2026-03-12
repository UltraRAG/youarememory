from __future__ import annotations

import json
from pathlib import Path

import streamlit as st

from memory_lab_py import HeartbeatIndexer, MemoryRepository, ReasoningRetriever, load_skills_runtime


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


DEFAULT_DB_PATH = str((Path.home() / ".openclaw" / "youarememory" / "memory.sqlite").resolve())
DEFAULT_SKILLS_DIR = str((_repo_root() / "packages" / "openclaw-memory-plugin" / "skills").resolve())


def _to_json(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _build_runtime(db_path: str, skills_dir: str, batch_size: int):
    repository = MemoryRepository(db_path)
    skills = load_skills_runtime(skills_dir=skills_dir)
    indexer = HeartbeatIndexer(repository, skills, batch_size=batch_size, source="python-memory-lab")
    retriever = ReasoningRetriever(repository, skills)
    return repository, skills, indexer, retriever


def _build_messages(user_text: str, assistant_text: str) -> list[dict]:
    messages: list[dict] = []
    if user_text.strip():
        messages.append({"msgId": "m1", "role": "user", "content": user_text.strip()})
    if assistant_text.strip():
        messages.append({"msgId": "m2", "role": "assistant", "content": assistant_text.strip()})
    return messages


st.set_page_config(page_title="YouAreMemory Python Lab", layout="wide")
st.title("YouAreMemory Python 测试版 UI")
st.caption("用于本地功能验证：注入 L0、执行 heartbeat、运行 retrieve、查看 SQLite 快照。")

with st.sidebar:
    st.header("运行配置")
    db_path = st.text_input("SQLite 路径", value=DEFAULT_DB_PATH)
    skills_dir = st.text_input("Skills 规则目录", value=DEFAULT_SKILLS_DIR)
    session_key = st.text_input("默认 sessionKey", value="python-lab-session")
    batch_size = st.number_input("heartbeatBatchSize", min_value=1, max_value=500, value=30, step=1)
    include_facts = st.checkbox("retrieve 包含 facts", value=True)

tab_ingest, tab_retrieve, tab_snapshot = st.tabs(["写入与索引", "检索", "快照浏览"])

with tab_ingest:
    st.subheader("写入 L0 + heartbeat")
    user_text = st.text_area("用户消息", value="我正在做 YouAreMemory 的 Python 测试版。")
    assistant_text = st.text_area("助手消息（可选）", value="好的，我会先创建基础模块。")
    run_heartbeat_after_capture = st.checkbox("写入后立即执行 heartbeat", value=True)
    capture_col, heartbeat_col = st.columns(2)

    with capture_col:
        if st.button("写入 L0", use_container_width=True):
            repository, _, indexer, _ = _build_runtime(db_path, skills_dir, int(batch_size))
            try:
                messages = _build_messages(user_text, assistant_text)
                if not messages:
                    st.error("至少填写一条用户消息。")
                else:
                    l0_record = indexer.capture_l0_session({"sessionKey": session_key, "messages": messages})
                    result = {"l0": l0_record}
                    if run_heartbeat_after_capture:
                        result["heartbeat"] = indexer.run_heartbeat()
                    st.success("写入完成。")
                    st.code(_to_json(result), language="json")
            finally:
                repository.close()

    with heartbeat_col:
        if st.button("仅执行 heartbeat", use_container_width=True):
            repository, _, indexer, _ = _build_runtime(db_path, skills_dir, int(batch_size))
            try:
                stats = indexer.run_heartbeat()
                st.success("heartbeat 完成。")
                st.code(_to_json(stats), language="json")
            finally:
                repository.close()

with tab_retrieve:
    st.subheader("L2 -> L1 -> L0 检索")
    query = st.text_input("检索问题", value="我这个项目最近进展到哪里了？")
    limit = st.slider("每层返回上限", min_value=1, max_value=20, value=6)
    if st.button("执行 retrieve", use_container_width=True):
        repository, _, _, retriever = _build_runtime(db_path, skills_dir, int(batch_size))
        try:
            result = retriever.retrieve(
                query,
                {
                    "l2Limit": int(limit),
                    "l1Limit": int(limit),
                    "l0Limit": max(3, int(limit / 2)),
                    "includeFacts": include_facts,
                },
            )
            st.code(_to_json(result), language="json")
        finally:
            repository.close()

with tab_snapshot:
    st.subheader("数据库快照与分层查询")
    snapshot_limit = st.slider("快照条数", min_value=1, max_value=100, value=20)
    search_query = st.text_input("搜索词（用于 L2/L1/L0/facts）", value="")
    search_limit = st.slider("搜索上限", min_value=1, max_value=50, value=10)
    if st.button("刷新快照", use_container_width=True):
        repository, _, _, retriever = _build_runtime(db_path, skills_dir, int(batch_size))
        try:
            payload = {
                "overview": repository.get_overview(),
                "snapshot": repository.get_ui_snapshot(snapshot_limit),
                "search": {
                    "l2Time": repository.search_l2_time_indexes(search_query, search_limit),
                    "l2Project": repository.search_l2_project_indexes(search_query, search_limit),
                    "l1": repository.search_l1(search_query, search_limit),
                    "l0": repository.search_l0(search_query, search_limit),
                    "facts": repository.search_facts(search_query, search_limit),
                    "retrieve": retriever.retrieve(
                        search_query or "最近",
                        {
                            "l2Limit": min(search_limit, 12),
                            "l1Limit": min(search_limit, 12),
                            "l0Limit": max(3, min(search_limit, 8)),
                            "includeFacts": include_facts,
                        },
                    ),
                },
            }
            st.code(_to_json(payload), language="json")
        finally:
            repository.close()
