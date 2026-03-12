from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, Callable

import streamlit as st

from memory_lab_py import (
    HeartbeatIndexer,
    MemoryRepository,
    MemoryTools,
    OpenClawLikeRuntimeSimulator,
    ReasoningRetriever,
    SessionManager,
    call_openai_compatible_chat,
    load_skills_runtime,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


DEFAULT_DB_PATH = str((Path.home() / ".openclaw" / "youarememory" / "memory.sqlite").resolve())
DEFAULT_SKILLS_DIR = str((_repo_root() / "packages" / "openclaw-memory-plugin" / "skills").resolve())
DEFAULT_OPENAI_BASE_URL = "http://127.0.0.1:8000/v1"
BROWSER_OPENAI_QUERY_KEY = "youarememory_openai_cfg"
NO_THINKING_INSTRUCTION = "请只输出最终回答，不要输出思考过程、推理链路或 Thinking Process。"
DEFAULT_QWEN_EXTRA_BODY = json.dumps(
    {
        "chat_template_kwargs": {
            "enable_thinking": False,
        }
    },
    ensure_ascii=False,
    indent=2,
)

OPENAI_DEFAULTS: dict[str, Any] = {
    "openai_enable": False,
    "openai_base_url": DEFAULT_OPENAI_BASE_URL,
    "openai_api_key": "",
    "openai_model": "your-local-model",
    "openai_temperature": 0.2,
    "openai_max_tokens": 1200,
    "openai_timeout": 60,
    "openai_system_prompt": (
        "你是一个记忆分析助手。请严格基于给定的记忆上下文回答，不要编造事实。"
        f"{NO_THINKING_INSTRUCTION}"
    ),
    "openai_extra_body": DEFAULT_QWEN_EXTRA_BODY,
}


def _to_json(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _truncate(text: str, max_length: int) -> str:
    if max_length <= 0 or len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def _ensure_no_thinking_instruction(system_prompt: str) -> str:
    text = (system_prompt or "").strip()
    if NO_THINKING_INSTRUCTION in text:
        return text
    if not text:
        return NO_THINKING_INSTRUCTION
    return f"{text}\n\n{NO_THINKING_INSTRUCTION}"


def _ensure_default_state() -> None:
    for key, value in OPENAI_DEFAULTS.items():
        st.session_state.setdefault(key, value)
    st.session_state.setdefault("session_key_input", "python-lab-session")
    st.session_state.setdefault("_browser_openai_init_done", False)
    st.session_state.setdefault("_browser_openai_status", "")
    st.session_state.setdefault("_pending_force_openai_reload", False)
    st.session_state.setdefault("_flash_notice", "")
    st.session_state.setdefault("_pending_session_key_switch", "")


def _current_openai_config() -> dict[str, Any]:
    return {
        "openai_enable": bool(st.session_state.get("openai_enable", False)),
        "openai_base_url": str(st.session_state.get("openai_base_url", DEFAULT_OPENAI_BASE_URL)),
        "openai_api_key": str(st.session_state.get("openai_api_key", "")),
        "openai_model": str(st.session_state.get("openai_model", "your-local-model")),
        "openai_temperature": float(st.session_state.get("openai_temperature", 0.2)),
        "openai_max_tokens": int(st.session_state.get("openai_max_tokens", 1200)),
        "openai_timeout": int(st.session_state.get("openai_timeout", 60)),
        "openai_system_prompt": str(st.session_state.get("openai_system_prompt", "")),
        "openai_extra_body": str(st.session_state.get("openai_extra_body", "")),
    }


def _encode_openai_config_for_browser(config: dict[str, Any]) -> str:
    raw = json.dumps(config, ensure_ascii=False, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_openai_config_from_browser(encoded: str) -> dict[str, Any]:
    padded = encoded + ("=" * (-len(encoded) % 4))
    decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    payload = json.loads(decoded)
    if not isinstance(payload, dict):
        raise ValueError("缓存配置不是 JSON 对象")
    return payload


def _load_openai_config_from_browser(*, force: bool = False) -> tuple[bool, str]:
    if (not force) and st.session_state.get("_browser_openai_init_done"):
        return True, "已完成浏览器配置初始化。"

    st.session_state["_browser_openai_init_done"] = True
    raw = st.query_params.get(BROWSER_OPENAI_QUERY_KEY, "")
    if isinstance(raw, list):
        raw = raw[0] if raw else ""
    if not isinstance(raw, str) or not raw.strip():
        return True, "浏览器缓存中还没有保存过 OpenAI 配置。"
    try:
        payload = _decode_openai_config_from_browser(raw.strip())
        for key in OPENAI_DEFAULTS:
            if key in payload:
                st.session_state[key] = payload[key]
        if not str(st.session_state.get("openai_extra_body", "")).strip():
            st.session_state["openai_extra_body"] = DEFAULT_QWEN_EXTRA_BODY
        return True, "已从浏览器缓存读取 OpenAI 配置。"
    except Exception as error:  # noqa: BLE001
        return False, f"读取浏览器配置失败：{error}"


def _save_openai_config_to_browser(config: dict[str, Any]) -> tuple[bool, str]:
    encoded = _encode_openai_config_for_browser(config)
    st.query_params[BROWSER_OPENAI_QUERY_KEY] = encoded
    st.session_state["_browser_openai_init_done"] = True
    return True, "已保存到浏览器缓存（当前页面 URL）。"


def _clear_openai_config_in_browser() -> tuple[bool, str]:
    if BROWSER_OPENAI_QUERY_KEY in st.query_params:
        del st.query_params[BROWSER_OPENAI_QUERY_KEY]
    st.session_state["_browser_openai_init_done"] = True
    return True, "已清空浏览器缓存中的 OpenAI 配置。"


def _parse_extra_body(raw: str) -> dict | None:
    text = raw.strip()
    if not text:
        return None
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("extra body 必须是 JSON 对象")
    return parsed


def _build_index_build_config(
    *,
    index_build_full_llm: bool,
    openai_base_url: str,
    openai_api_key: str,
    openai_model: str,
    openai_temperature: float,
    openai_max_tokens: int,
    openai_timeout: int,
    openai_extra_body: str,
) -> dict[str, Any]:
    extra_body = _parse_extra_body(openai_extra_body)
    return {
        "enabled": bool(index_build_full_llm),
        "base_url": openai_base_url.strip(),
        "api_key": openai_api_key,
        "model": openai_model.strip(),
        "temperature": float(openai_temperature),
        "max_tokens": int(openai_max_tokens),
        "timeout_seconds": int(openai_timeout),
        "extra_body": extra_body if isinstance(extra_body, dict) else None,
    }


def _list_session_keys_from_db(db_path: str, limit: int = 200) -> list[str]:
    repository = MemoryRepository(db_path)
    try:
        return repository.list_distinct_session_keys(limit=limit)
    finally:
        repository.close()


def _load_session_messages_from_db(db_path: str, session_key: str, limit: int = 500) -> list[dict[str, Any]]:
    repository = MemoryRepository(db_path)
    try:
        records = repository.list_l0_by_session_key(session_key=session_key, limit=limit)
    finally:
        repository.close()
    messages: list[dict[str, Any]] = []
    for record in records:
        raw_messages = record.get("messages", [])
        if not isinstance(raw_messages, list):
            continue
        for raw in raw_messages:
            if not isinstance(raw, dict):
                continue
            role = str(raw.get("role", "")).strip()
            content = str(raw.get("content", "")).strip()
            if role not in ("user", "assistant", "system") or not content:
                continue
            item: dict[str, Any] = {"role": role, "content": content}
            msg_id = raw.get("id") or raw.get("msgId")
            if isinstance(msg_id, str) and msg_id.strip():
                item["id"] = msg_id.strip()
            messages.append(item)
    return messages


def _build_runtime(db_path: str, skills_dir: str, batch_size: int, index_build_config: dict[str, Any] | None = None):
    repository = MemoryRepository(db_path)
    skills = load_skills_runtime(skills_dir=skills_dir)
    indexer = HeartbeatIndexer(
        repository,
        skills,
        batch_size=batch_size,
        source="python-memory-lab",
        index_build_config=index_build_config or {},
    )
    retriever = ReasoningRetriever(repository, skills)
    return repository, skills, indexer, retriever


def _build_messages_for_capture(user_text: str, assistant_text: str) -> list[dict]:
    messages: list[dict] = []
    if user_text.strip():
        messages.append({"msgId": "m1", "role": "user", "content": user_text.strip()})
    if assistant_text.strip():
        messages.append({"msgId": "m2", "role": "assistant", "content": assistant_text.strip()})
    return messages


def _collect_heartbeat_diagnostics(repository: MemoryRepository) -> dict:
    overview = repository.get_overview()
    pending_unindexed = repository.count_unindexed_l0_sessions()
    return {
        "dbPath": repository.db_path,
        "overview": overview,
        "pendingUnindexedL0": pending_unindexed,
    }


def _show_index_table(title: str, rows: list[dict]):
    st.markdown(f"**{title}**（{len(rows)} 条）")
    if not rows:
        st.info("当前为空。")
        return
    st.dataframe(rows, use_container_width=True, hide_index=True)


def _show_build_trace(trace: dict):
    steps = trace.get("steps", [])
    st.markdown("**索引构建过程**")
    llm_config = trace.get("llmConfig")
    if llm_config:
        with st.expander("本轮索引构建模型配置", expanded=False):
            st.code(_to_json(llm_config), language="json")
    if not steps:
        st.info("本次没有处理任何未索引 L0。")
        return
    summary_rows = []
    for step in steps:
        source = step.get("sourceL0", {})
        l1_build = step.get("l1Build", step.get("builtL1", {}))
        l2_time_build = step.get("l2TimeBuild", step.get("builtL2Time", {}))
        l2_project_build = step.get("l2ProjectBuild", {})
        built_l2_projects = step.get("builtL2Projects", [])
        project_count = l2_project_build.get("count")
        if project_count is None:
            project_count = len(built_l2_projects) if isinstance(built_l2_projects, list) else 0
        facts_build = step.get("factsBuild", {})
        fact_count = facts_build.get("count")
        if fact_count is None:
            fact_count = l1_build.get("factCount", 0)
        summary_rows.append(
            {
                "l0IndexId": source.get("l0IndexId", ""),
                "status": step.get("status", "success"),
                "l1IndexId": l1_build.get("l1IndexId", ""),
                "dateKey": l2_time_build.get("dateKey", ""),
                "projectCount": project_count,
                "factCount": fact_count,
                "error": _truncate(str(step.get("error", "")), 120),
            }
        )
    st.dataframe(summary_rows, use_container_width=True, hide_index=True)
    with st.expander("查看每条 L0 的详细构建步骤", expanded=False):
        st.code(_to_json(steps), language="json")


def _show_reasoning_trace(trace: dict):
    st.markdown("**推理过程 trace**")
    st.code(_to_json(trace), language="json")


def _ensure_session_manager() -> SessionManager:
    manager = st.session_state.get("session_manager")
    if isinstance(manager, SessionManager):
        return manager
    manager = SessionManager()
    st.session_state["session_manager"] = manager
    return manager


def _default_tool_params(tool_name: str) -> dict[str, Any]:
    mapping: dict[str, dict[str, Any]] = {
        "memory_recall": {"query": "项目进展", "limit": 6, "includeFacts": True, "withTrace": True},
        "memory_store": {"content": "用户偏好 Python", "factKey": "preference:python", "confidence": 0.9},
        "search_l2": {"query": "项目", "type": "project", "limit": 8},
        "search_l1": {"query": "最近进展", "l1Ids": [], "limit": 8},
        "search_l0": {"query": "实现", "l0Ids": [], "limit": 6},
        "memory_search": {"query": "最近在做什么", "limit": 6},
    }
    return mapping.get(tool_name, {"query": "项目进展"})


def _make_llm_callable(
    *,
    enable_openai_backend: bool,
    openai_base_url: str,
    openai_api_key: str,
    openai_model: str,
    openai_temperature: float,
    openai_max_tokens: int,
    openai_timeout: int,
    openai_extra_body: str,
) -> Callable[..., dict[str, Any]]:
    def _mock_callable(*, messages: list[dict[str, str]], **_kwargs) -> dict[str, Any]:
        last_user = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                last_user = message.get("content", "")
                break
        return {
            "request": {"mode": "mock"},
            "response": {"note": "OpenAI 兼容后端未启用，返回本地模拟回答。"},
            "answer": f"【模拟回答】已收到你的问题。\n\n{last_user[:500]}",
        }

    if not enable_openai_backend:
        return _mock_callable

    def _openai_callable(*, messages: list[dict[str, str]], **_kwargs) -> dict[str, Any]:
        extra_body = _parse_extra_body(openai_extra_body)
        return call_openai_compatible_chat(
            base_url=openai_base_url,
            api_key=openai_api_key,
            model=openai_model,
            messages=messages,
            temperature=float(openai_temperature),
            max_tokens=int(openai_max_tokens),
            timeout_seconds=int(openai_timeout),
            extra_body=extra_body,
        )

    return _openai_callable


st.set_page_config(page_title="YouAreMemory Python Lab", layout="wide")
_ensure_default_state()
if not st.session_state.get("_browser_openai_init_done"):
    ok, msg = _load_openai_config_from_browser(force=False)
    st.session_state["_browser_openai_status"] = msg
    if ok and "读取" in msg:
        st.toast("已自动读取浏览器缓存中的 OpenAI 配置", icon="✅")
if st.session_state.get("_pending_force_openai_reload"):
    ok, msg = _load_openai_config_from_browser(force=True)
    st.session_state["_browser_openai_status"] = msg
    st.session_state["_pending_force_openai_reload"] = False
    if ok:
        st.toast("已从浏览器缓存重新加载配置", icon="✅")
pending_session_switch = str(st.session_state.get("_pending_session_key_switch", "")).strip()
if pending_session_switch:
    st.session_state["session_key_input"] = pending_session_switch
    st.session_state["_pending_session_key_switch"] = ""
flash_notice = str(st.session_state.get("_flash_notice", "")).strip()
if flash_notice:
    st.toast(flash_notice, icon="✅")
    st.session_state["_flash_notice"] = ""
st.title("YouAreMemory Python 测试版 UI")
st.caption("用于本地完整复刻验证：索引查看、索引构建过程、推理过程、工具调用、OpenClaw-like 对话模拟。")

session_manager = _ensure_session_manager()

with st.sidebar:
    st.header("运行配置")
    db_path = st.text_input("SQLite 路径", value=DEFAULT_DB_PATH)
    skills_dir = st.text_input("Skills 规则目录", value=DEFAULT_SKILLS_DIR)
    db_session_keys = _list_session_keys_from_db(db_path, limit=200)
    memory_session_keys = session_manager.list_session_keys()
    existing_keys = list(dict.fromkeys([*memory_session_keys, *db_session_keys]).keys())
    default_session_key = existing_keys[0] if existing_keys else "python-lab-session"
    selected_session_key = st.selectbox("会话选择", options=(existing_keys if existing_keys else [default_session_key]), index=0)
    if st.button("使用选中会话", use_container_width=True):
        st.session_state["session_key_input"] = selected_session_key
        st.success(f"已切换到会话：{selected_session_key}")
    new_session_key = st.text_input("新建会话 key", value="")
    if st.button("创建会话", use_container_width=True):
        target = (new_session_key or "python-lab-session").strip()
        session_manager.ensure_session(target)
        st.session_state["session_key_input"] = target
        st.success(f"会话已创建：{target}")
    if not str(st.session_state.get("session_key_input", "")).strip():
        st.session_state["session_key_input"] = selected_session_key
    session_key = st.text_input("当前 sessionKey（可覆盖）", key="session_key_input")
    batch_size = st.number_input("heartbeatBatchSize", min_value=1, max_value=500, value=30, step=1)
    capture_strategy = st.selectbox("captureStrategy", options=["last_turn", "full_session"], index=0)
    include_assistant_for_capture = st.checkbox("capture 包含 assistant", value=True)
    max_message_chars = st.number_input("maxMessageChars", min_value=100, max_value=50000, value=6000, step=100)
    include_facts = st.checkbox("retrieve 包含 facts", value=True)
    if st.button("清空当前会话消息", use_container_width=True):
        session_manager.clear_session(session_key)
        st.success(f"已清空会话：{session_key}")
    st.divider()
    st.header("OpenAI 兼容推理设置")
    enable_openai_backend = st.checkbox("启用 OpenAI 兼容后端", key="openai_enable")
    openai_base_url = st.text_input("Base URL（OpenAI 兼容）", key="openai_base_url")
    openai_api_key = st.text_input("API Key（本地可留空）", key="openai_api_key", type="password")
    openai_model = st.text_input("模型名", key="openai_model")
    openai_temperature = st.slider("Temperature", min_value=0.0, max_value=2.0, step=0.1, key="openai_temperature")
    openai_max_tokens = st.number_input("Max Tokens", min_value=1, max_value=16384, step=50, key="openai_max_tokens")
    openai_timeout = st.number_input("请求超时（秒）", min_value=5, max_value=300, step=5, key="openai_timeout")
    openai_system_prompt = st.text_area(
        "System Prompt（可选）",
        key="openai_system_prompt",
        height=90,
    )
    openai_extra_body = st.text_area(
        "额外 JSON 参数（可选）",
        key="openai_extra_body",
        help="默认已为 Qwen3.5 关闭 thinking，可按需改写。",
        height=120,
    )
    index_build_full_llm = st.checkbox("索引构建=全模型（L1/L2/facts）", value=True)
    index_build_model = st.text_input("索引构建模型（留空=跟随上方模型）", value="")
    st.caption("提示：保存后配置会写入当前页面 URL 缓存，刷新或重开同一地址可直接恢复。")
    config_col1, config_col2, config_col3 = st.columns(3)
    if config_col1.button("保存到浏览器", use_container_width=True):
        ok, msg = _save_openai_config_to_browser(_current_openai_config())
        st.session_state["_browser_openai_status"] = msg
        if ok:
            st.success(msg)
        else:
            st.error(msg)
    if config_col2.button("从浏览器读取", use_container_width=True):
        st.session_state["_pending_force_openai_reload"] = True
        st.rerun()
    if config_col3.button("清空浏览器配置", use_container_width=True):
        ok, msg = _clear_openai_config_in_browser()
        st.session_state["_browser_openai_status"] = msg
        if ok:
            st.success(msg)
        else:
            st.error(msg)
    browser_status = str(st.session_state.get("_browser_openai_status", "")).strip()
    if browser_status:
        st.caption(f"浏览器配置状态：{browser_status}")
    st.divider()
    st.subheader("危险操作")
    st.caption("一键清空当前 SQLite 中全部 memory 数据（L0/L1/L2/facts/links/state）。")
    if st.button("一键清空当前全部 memory", use_container_width=True, type="primary"):
        repository = MemoryRepository(db_path)
        try:
            result = repository.clear_all_memory()
            session_manager.clear_all_sessions()
            for cache_key in [
                "index_view_payload",
                "last_heartbeat_result",
                "last_reasoning_result",
                "last_reasoning_query",
                "last_llm_output",
                "chat_last_result",
            ]:
                st.session_state.pop(cache_key, None)
            st.session_state["_flash_notice"] = "已清空当前数据库的全部 memory 数据。"
            st.success("已清空当前数据库的全部 memory 数据。")
            st.code(_to_json({"dbPath": db_path, **result}), language="json")
        finally:
            repository.close()

tab_indexes, tab_ingest, tab_retrieve, tab_tools, tab_chat = st.tabs(
    ["各级索引查看", "索引构建过程", "推理过程", "工具调用台", "对话模拟台(OpenClaw-like)"]
)
session_key = session_key.strip() or "python-lab-session"
session_manager.ensure_session(session_key)
try:
    index_build_config = _build_index_build_config(
        index_build_full_llm=bool(index_build_full_llm),
        openai_base_url=openai_base_url,
        openai_api_key=openai_api_key,
        openai_model=(index_build_model.strip() or openai_model),
        openai_temperature=float(openai_temperature),
        openai_max_tokens=int(openai_max_tokens),
        openai_timeout=int(openai_timeout),
        openai_extra_body=openai_extra_body,
    )
except Exception as error:
    index_build_config = {"enabled": False}
    st.warning(f"索引构建模型参数解析失败，已禁用本轮模型构建：{error}")

with tab_indexes:
    st.subheader("查看当前已建立的各级索引")
    snapshot_limit = st.slider("最近索引条数", min_value=1, max_value=100, value=20, key="index_snapshot_limit")
    search_query = st.text_input("搜索词（可选）", value="", key="index_search_query")
    search_limit = st.slider("搜索上限", min_value=1, max_value=50, value=10, key="index_search_limit")
    if st.button("刷新索引视图", use_container_width=True, key="refresh_indexes"):
        repository, _, _, _ = _build_runtime(
            db_path,
            skills_dir,
            int(batch_size),
            index_build_config=index_build_config,
        )
        try:
            payload = {
                "dbPath": repository.db_path,
                "overview": repository.get_overview(),
                "recent": repository.get_ui_snapshot(snapshot_limit),
                "recentL1": repository.list_recent_l1(snapshot_limit),
                "search": {
                    "l2Time": repository.search_l2_time_indexes(search_query, search_limit),
                    "l2Project": repository.search_l2_project_indexes(search_query, search_limit),
                    "l1": repository.search_l1(search_query, search_limit),
                    "l0": repository.search_l0(search_query, search_limit),
                    "facts": repository.search_facts(search_query, search_limit),
                },
            }
            st.session_state["index_view_payload"] = payload
        finally:
            repository.close()

    payload = st.session_state.get("index_view_payload")
    if payload:
        overview = payload["overview"]
        cols = st.columns(5)
        cols[0].metric("L0 总数", overview.get("totalL0", 0))
        cols[1].metric("L1 总数", overview.get("totalL1", 0))
        cols[2].metric("L2 时间总数", overview.get("totalL2Time", 0))
        cols[3].metric("L2 项目总数", overview.get("totalL2Project", 0))
        cols[4].metric("事实总数", overview.get("totalFacts", 0))
        st.caption(f"当前数据库：`{payload['dbPath']}` | lastIndexedAt={overview.get('lastIndexedAt', 'N/A')}")

        recent = payload["recent"]
        _show_index_table("最近 L2 时间索引", recent.get("recentTimeIndexes", []))
        _show_index_table("最近 L2 项目索引", recent.get("recentProjectIndexes", []))
        _show_index_table("最近 L1 窗口", payload.get("recentL1", []))
        _show_index_table("最近 L0 会话", recent.get("recentSessions", []))
        _show_index_table("最近事实画像", recent.get("recentFacts", []))

        with st.expander("搜索结果（L2/L1/L0/facts）", expanded=False):
            st.code(_to_json(payload["search"]), language="json")

with tab_ingest:
    st.subheader("索引构建过程（L0 -> L1 -> L2）")
    user_text = st.text_area("用户消息", value="我正在做 YouAreMemory 的 Python 测试版。")
    assistant_text = st.text_area("助手消息（可选）", value="好的，我会先创建基础模块。")
    run_heartbeat_after_capture = st.checkbox("写入后立即执行 heartbeat", value=True)
    capture_col, heartbeat_col = st.columns(2)

    with capture_col:
        if st.button("写入 L0（可选自动索引）", use_container_width=True):
            repository, _, indexer, _ = _build_runtime(
                db_path,
                skills_dir,
                int(batch_size),
                index_build_config=index_build_config,
            )
            try:
                messages = _build_messages_for_capture(user_text, assistant_text)
                if not messages:
                    st.error("至少填写一条用户消息。")
                else:
                    before_diag = _collect_heartbeat_diagnostics(repository)
                    l0_record = indexer.capture_l0_session({"sessionKey": session_key, "messages": messages})
                    after_capture_diag = _collect_heartbeat_diagnostics(repository)
                    result = {
                        "l0": l0_record,
                        "before": before_diag,
                        "afterCapture": after_capture_diag,
                    }
                    if run_heartbeat_after_capture:
                        heartbeat_result = indexer.run_heartbeat_with_trace()
                        result["heartbeat"] = heartbeat_result
                        result["afterHeartbeat"] = _collect_heartbeat_diagnostics(repository)
                        st.session_state["last_heartbeat_result"] = heartbeat_result
                    st.success("写入完成。")
                    if not run_heartbeat_after_capture:
                        st.info("当前仅写入 L0，尚未索引。可点击右侧“仅执行 heartbeat（处理未索引 L0）”。")
                    st.code(_to_json(result), language="json")
                    if run_heartbeat_after_capture:
                        _show_build_trace(result["heartbeat"]["trace"])
            finally:
                repository.close()

    with heartbeat_col:
        if st.button("仅执行 heartbeat（处理未索引 L0）", use_container_width=True):
            repository, _, indexer, _ = _build_runtime(
                db_path,
                skills_dir,
                int(batch_size),
                index_build_config=index_build_config,
            )
            try:
                before_diag = _collect_heartbeat_diagnostics(repository)
                heartbeat_result = indexer.run_heartbeat_with_trace()
                stats = heartbeat_result["stats"]
                after_diag = _collect_heartbeat_diagnostics(repository)
                st.success("heartbeat 完成。")
                if stats.get("l0Captured", 0) == 0:
                    st.warning("本次没有待处理的未索引 L0，所以统计为 0 是正常现象。请先写入 L0 或检查 SQLite 路径。")
                payload = {
                    "stats": stats,
                    "before": before_diag,
                    "after": after_diag,
                    "trace": heartbeat_result["trace"],
                }
                st.session_state["last_heartbeat_result"] = heartbeat_result
                st.code(_to_json(payload), language="json")
                _show_build_trace(heartbeat_result["trace"])
            finally:
                repository.close()

with tab_retrieve:
    st.subheader("推理过程（检索降级 + 可选 LLM 回答）")
    query = st.text_input("检索问题", value="我这个项目最近进展到哪里了？")
    limit = st.slider("每层返回上限", min_value=1, max_value=20, value=6)
    if st.button("执行检索推理（含过程）", use_container_width=True):
        repository, _, _, retriever = _build_runtime(
            db_path,
            skills_dir,
            int(batch_size),
            index_build_config=index_build_config,
        )
        try:
            result = retriever.retrieve(
                query,
                {
                    "l2Limit": int(limit),
                    "l1Limit": int(limit),
                    "l0Limit": max(3, int(limit / 2)),
                    "includeFacts": include_facts,
                    "withTrace": True,
                },
            )
            st.session_state["last_reasoning_result"] = result
            st.session_state["last_reasoning_query"] = query
            st.success("检索推理完成。")
        finally:
            repository.close()

    reasoning_result = st.session_state.get("last_reasoning_result")
    reasoning_query = st.session_state.get("last_reasoning_query", query)
    if reasoning_result:
        st.markdown("**检索结果（含上下文）**")
        st.code(_to_json(reasoning_result), language="json")
        if reasoning_result.get("trace"):
            st.markdown("**推理过程 trace**")
            st.code(_to_json(reasoning_result["trace"]), language="json")

    st.divider()
    st.subheader("可选：调用 OpenAI 兼容后端做最终回答")
    if enable_openai_backend:
        if st.button("基于当前记忆上下文调用模型", use_container_width=True):
            if not reasoning_result:
                st.error("请先执行一次“检索推理（含过程）”。")
            else:
                try:
                    extra_body = _parse_extra_body(openai_extra_body)
                    user_prompt = (
                        "请根据下面的记忆上下文回答用户问题。\n\n"
                        f"【用户问题】\n{reasoning_query}\n\n"
                        f"【记忆上下文】\n{reasoning_result.get('context', '')}\n\n"
                        f"【检索过程】\n{_to_json(reasoning_result.get('trace', {}))}\n\n"
                        "请输出：\n"
                        "1) 结论\n"
                        "2) 依据（引用到 L2/L1/L0 哪一层）\n"
                        "3) 不确定项（如果有）"
                    )
                    messages = []
                    effective_system_prompt = _ensure_no_thinking_instruction(openai_system_prompt)
                    if effective_system_prompt.strip():
                        messages.append({"role": "system", "content": effective_system_prompt.strip()})
                    messages.append({"role": "user", "content": user_prompt})
                    llm_output = call_openai_compatible_chat(
                        base_url=openai_base_url,
                        api_key=openai_api_key,
                        model=openai_model,
                        messages=messages,
                        temperature=float(openai_temperature),
                        max_tokens=int(openai_max_tokens),
                        timeout_seconds=int(openai_timeout),
                        extra_body=extra_body,
                    )
                    st.session_state["last_llm_output"] = llm_output
                    st.success("模型推理完成。")
                except Exception as error:
                    st.error(f"模型推理失败：{error}")

        llm_output = st.session_state.get("last_llm_output")
        if llm_output:
            st.markdown("**模型回答**")
            st.write(llm_output.get("answer", ""))
            with st.expander("查看模型原始响应 JSON", expanded=False):
                st.code(_to_json(llm_output), language="json")
    else:
        st.info("如需测试大模型推理，请在左侧开启“OpenAI 兼容后端”。")

with tab_tools:
    st.subheader("工具调用台（对齐 TS 插件工具）")
    tool_name = st.selectbox(
        "工具名",
        options=["memory_recall", "memory_store", "search_l2", "search_l1", "search_l0", "memory_search"],
        index=0,
    )
    default_params = _default_tool_params(tool_name)
    params_text = st.text_area(
        "参数 JSON",
        value=_to_json(default_params),
        height=200,
        key=f"tool_params_{tool_name}",
    )
    if st.button("执行工具调用", use_container_width=True):
        repository, _, _, retriever = _build_runtime(
            db_path,
            skills_dir,
            int(batch_size),
            index_build_config=index_build_config,
        )
        try:
            try:
                params = json.loads(params_text)
                if not isinstance(params, dict):
                    raise ValueError("参数必须是 JSON 对象")
            except Exception as error:
                st.error(f"参数解析失败：{error}")
                params = None
            if params is not None:
                tools = MemoryTools(repository, retriever)
                result = tools.invoke(tool_name, params)
                st.code(_to_json(result), language="json")
        finally:
            repository.close()

with tab_chat:
    st.subheader("Chat 页面（OpenClaw-like）")
    st.caption("像 OpenClaw 一样直接对话：每次发送都会自动执行 before_prompt_build 检索注入，并在回答后自动写入 L0+heartbeat。")
    chat_left_col, chat_main_col = st.columns([1, 3])
    with chat_left_col:
        st.markdown("**对话列表**")
        chat_db_keys = _list_session_keys_from_db(db_path, limit=100)
        chat_memory_keys = session_manager.list_session_keys()
        chat_keys = list(dict.fromkeys([*chat_db_keys, *chat_memory_keys]).keys())
        if st.button("新建对话", use_container_width=True, key="chat_new_conversation"):
            new_key = f"chat-{int(st.session_state.get('chat_new_nonce', 0)) + 1}"
            st.session_state["chat_new_nonce"] = int(st.session_state.get("chat_new_nonce", 0)) + 1
            session_manager.ensure_session(new_key)
            st.session_state["_pending_session_key_switch"] = new_key
            st.rerun()
        if chat_keys:
            for idx, key in enumerate(chat_keys[:60]):
                label = key if len(key) <= 28 else f"{key[:28]}..."
                active = key == session_key
                button_label = f"● {label}" if active else label
                if st.button(button_label, use_container_width=True, key=f"chat_select_{idx}_{key}"):
                    st.session_state["_pending_session_key_switch"] = key
                    st.rerun()
        else:
            st.caption("暂无历史会话。")
    with chat_main_col:
        chat_system_prompt = st.text_area("对话 System Prompt（可选）", value=openai_system_prompt, height=90, key="chat_system_prompt")
        chat_col1, chat_col2, chat_col3, chat_col4 = st.columns([1, 1, 1, 1.2])
        with chat_col1:
            l2_limit = st.slider("会话检索 l2Limit", min_value=1, max_value=20, value=6, key="chat_l2_limit")
        with chat_col2:
            l1_limit = st.slider("会话检索 l1Limit", min_value=1, max_value=20, value=6, key="chat_l1_limit")
        with chat_col3:
            l0_limit = st.slider("会话检索 l0Limit", min_value=1, max_value=20, value=4, key="chat_l0_limit")
        with chat_col4:
            if st.button("清空当前聊天", use_container_width=True, key="chat_clear_btn"):
                session_manager.clear_session(session_key)
                st.session_state.pop("chat_last_result", None)
                st.success("当前聊天已清空。")

        st.markdown(f"**当前会话**：`{session_key}`")
        session_messages = session_manager.get_messages(session_key)
        if not session_messages:
            restored_messages = _load_session_messages_from_db(db_path, session_key, limit=800)
            if restored_messages:
                session_manager.set_messages(session_key, restored_messages)
                session_messages = restored_messages
        if not session_messages:
            st.info("当前会话暂无消息。请在下方输入问题并回车发送。")
        for message in session_messages:
            role = str(message.get("role", "assistant"))
            content = str(message.get("content", "")).strip()
            if not content:
                continue
            if role == "user":
                with st.chat_message("user"):
                    st.write(content)
            elif role == "assistant":
                with st.chat_message("assistant"):
                    st.write(content)
            else:
                with st.chat_message("assistant"):
                    st.markdown(f"_({role})_ {content}")

        user_prompt = st.chat_input("输入消息，回车发送")
        if user_prompt and user_prompt.strip():
            repository, _, indexer, retriever = _build_runtime(
                db_path,
                skills_dir,
                int(batch_size),
                index_build_config=index_build_config,
            )
            try:
                with st.spinner("正在执行：检索注入 -> 模型回答 -> 自动索引..."):
                    simulator = OpenClawLikeRuntimeSimulator(
                        session_manager=session_manager,
                        repository=repository,
                        indexer=indexer,
                        retriever=retriever,
                        include_assistant=include_assistant_for_capture,
                        capture_strategy=capture_strategy,
                        max_message_chars=int(max_message_chars),
                    )
                    llm_callable = _make_llm_callable(
                        enable_openai_backend=enable_openai_backend,
                        openai_base_url=openai_base_url,
                        openai_api_key=openai_api_key,
                        openai_model=openai_model,
                        openai_temperature=float(openai_temperature),
                        openai_max_tokens=int(openai_max_tokens),
                        openai_timeout=int(openai_timeout),
                        openai_extra_body=openai_extra_body,
                    )
                    run_result = simulator.run_chat_turn(
                        session_key=session_key,
                        user_input=user_prompt,
                        llm_callable=llm_callable,
                        llm_options={},
                        system_prompt=_ensure_no_thinking_instruction(chat_system_prompt),
                        l2_limit=int(l2_limit),
                        l1_limit=int(l1_limit),
                        l0_limit=int(l0_limit),
                    )
                    st.session_state["chat_last_result"] = run_result
                st.rerun()
            except Exception as error:
                st.error(f"流程执行失败：{error}")
            finally:
                repository.close()

        chat_last_result = st.session_state.get("chat_last_result")
        if chat_last_result:
            with st.expander("查看本轮调试信息（请求/响应/trace）", expanded=False):
                llm_request = chat_last_result.get("llmRequest", {})
                llm_result = chat_last_result.get("llmResult", {})
                answer_text = ""
                if isinstance(llm_result, dict):
                    answer_text = str(llm_result.get("answer", ""))
                st.markdown("**模型请求 payload**")
                st.code(_to_json(llm_request), language="json")
                st.markdown("**模型响应 payload**")
                st.code(_to_json({"response": llm_result.get("response"), "answer": answer_text}), language="json")
                before_build = chat_last_result.get("beforePromptBuild", {})
                retrieval = before_build.get("retrieval", {})
                if retrieval.get("trace"):
                    _show_reasoning_trace(retrieval["trace"])
                agent_end = chat_last_result.get("agentEnd", {})
                heartbeat = agent_end.get("heartbeat", {})
                if isinstance(heartbeat, dict) and heartbeat.get("trace"):
                    _show_build_trace(heartbeat["trace"])
