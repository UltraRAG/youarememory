from __future__ import annotations

from typing import Any


def _truncate(text: str, max_length: int) -> str:
    if max_length <= 0 or len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def _extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        blocks: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                blocks.append(str(block["text"]))
        return "\n".join(blocks)
    return ""


def normalize_messages(
    raw_messages: list[Any],
    *,
    include_assistant: bool,
    max_message_chars: int,
    capture_strategy: str,
) -> list[dict]:
    all_messages: list[dict] = []
    for raw in raw_messages:
        if not isinstance(raw, dict):
            continue
        role = str(raw.get("role", ""))
        if role not in ("user", "assistant", "system"):
            continue
        if role == "assistant" and not include_assistant:
            continue

        content = _extract_text_from_content(raw.get("content")).strip()
        if not content:
            continue
        message = {
            "role": role,
            "content": _truncate(content, max_message_chars),
        }
        msg_id = raw.get("id")
        if isinstance(msg_id, str):
            message["msgId"] = msg_id
        all_messages.append(message)

    if capture_strategy == "full_session":
        return all_messages

    last_user = -1
    for index in range(len(all_messages) - 1, -1, -1):
        if all_messages[index]["role"] == "user":
            last_user = index
            break
    if last_user >= 0:
        return all_messages[last_user:]
    return all_messages[-2:]
