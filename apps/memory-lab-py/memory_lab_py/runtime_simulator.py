from __future__ import annotations

from typing import Any

from .message_utils import normalize_messages
from .tools import MemoryTools
from .utils_id import now_iso


class OpenClawLikeRuntimeSimulator:
    def __init__(
        self,
        *,
        session_manager,
        repository,
        indexer,
        retriever,
        include_assistant: bool = True,
        capture_strategy: str = "last_turn",
        max_message_chars: int = 6000,
    ):
        self.session_manager = session_manager
        self.repository = repository
        self.indexer = indexer
        self.retriever = retriever
        self.tools = MemoryTools(repository, retriever)
        self.include_assistant = include_assistant
        self.capture_strategy = capture_strategy
        self.max_message_chars = max_message_chars

    def before_prompt_build(self, user_prompt: str, *, l2_limit: int = 6, l1_limit: int = 6, l0_limit: int = 4) -> dict:
        retrieval = self.retriever.retrieve(
            user_prompt,
            {
                "l2Limit": l2_limit,
                "l1Limit": l1_limit,
                "l0Limit": l0_limit,
                "includeFacts": True,
                "withTrace": True,
            },
        )
        prepend_context = retrieval.get("context", "")
        return {
            "retrieval": retrieval,
            "prependContext": prepend_context,
            "event": "before_prompt_build",
        }

    def agent_end(self, session_key: str, raw_messages: list[dict[str, Any]]) -> dict:
        normalized = normalize_messages(
            raw_messages,
            include_assistant=self.include_assistant,
            max_message_chars=self.max_message_chars,
            capture_strategy=self.capture_strategy,
        )
        if not normalized:
            return {
                "event": "agent_end",
                "captured": False,
                "reason": "no normalized messages",
                "heartbeat": {"stats": {"l0Captured": 0, "l1Created": 0, "l2TimeUpdated": 0, "l2ProjectUpdated": 0, "factsUpdated": 0}, "trace": {"steps": []}},
            }

        l0_record = self.indexer.capture_l0_session(
            {
                "sessionKey": session_key,
                "timestamp": now_iso(),
                "messages": normalized,
                "source": "python-runtime-simulator",
            }
        )
        heartbeat_result = self.indexer.run_heartbeat_with_trace()
        return {
            "event": "agent_end",
            "captured": True,
            "l0": l0_record,
            "normalizedMessages": normalized,
            "heartbeat": heartbeat_result,
        }

    def run_chat_turn(
        self,
        *,
        session_key: str,
        user_input: str,
        llm_callable,
        llm_options: dict[str, Any],
        system_prompt: str = "",
        l2_limit: int = 6,
        l1_limit: int = 6,
        l0_limit: int = 4,
    ) -> dict:
        self.session_manager.ensure_session(session_key)
        before_build = self.before_prompt_build(
            user_input,
            l2_limit=l2_limit,
            l1_limit=l1_limit,
            l0_limit=l0_limit,
        )
        prepend_context = before_build.get("prependContext", "")

        final_user_prompt = user_input.strip()
        if prepend_context:
            final_user_prompt = f"{prepend_context}\n\n用户当前问题：{user_input.strip()}"

        messages: list[dict[str, str]] = []
        if system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt.strip()})
        messages.append({"role": "user", "content": final_user_prompt})

        llm_result = llm_callable(messages=messages, **llm_options)
        answer = str(llm_result.get("answer", "")).strip()

        self.session_manager.append_message(session_key, "user", user_input.strip())
        self.session_manager.append_message(session_key, "assistant", answer)
        raw_session_messages = self.session_manager.get_messages(session_key)

        end_result = self.agent_end(session_key, raw_session_messages)
        return {
            "sessionKey": session_key,
            "beforePromptBuild": before_build,
            "llmRequest": {
                "messages": messages,
            },
            "llmResult": llm_result,
            "agentEnd": end_result,
            "sessionMessages": raw_session_messages,
        }
