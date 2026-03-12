from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionManager:
    sessions: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def list_session_keys(self) -> list[str]:
        return sorted(self.sessions.keys())

    def ensure_session(self, session_key: str) -> None:
        if session_key not in self.sessions:
            self.sessions[session_key] = []

    def append_message(self, session_key: str, role: str, content: str, msg_id: str | None = None) -> dict[str, Any]:
        self.ensure_session(session_key)
        message: dict[str, Any] = {
            "role": role,
            "content": content,
        }
        if msg_id:
            message["id"] = msg_id
        self.sessions[session_key].append(message)
        return message

    def get_messages(self, session_key: str) -> list[dict[str, Any]]:
        self.ensure_session(session_key)
        return list(self.sessions[session_key])

    def clear_session(self, session_key: str) -> None:
        self.sessions[session_key] = []

    def delete_session(self, session_key: str) -> None:
        self.sessions.pop(session_key, None)

    def clear_all_sessions(self) -> None:
        self.sessions = {}

    def hydrate_from_l0_records(self, session_key: str, l0_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        for record in l0_records:
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
                msg: dict[str, Any] = {"role": role, "content": content}
                msg_id = raw.get("id") or raw.get("msgId")
                if isinstance(msg_id, str) and msg_id.strip():
                    msg["id"] = msg_id.strip()
                messages.append(msg)
        self.sessions[session_key] = messages
        return list(messages)

    def set_messages(self, session_key: str, messages: list[dict[str, Any]]) -> None:
        self.sessions[session_key] = list(messages)
