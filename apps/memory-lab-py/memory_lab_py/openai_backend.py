from __future__ import annotations

import re
from typing import Any

import requests


def _normalize_extra_body(extra_body: dict[str, Any] | None) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    if isinstance(extra_body, dict):
        normalized = dict(extra_body)
    legacy_wrapper = normalized.get("extra_body")
    if isinstance(legacy_wrapper, dict):
        # 兼容旧格式：{"extra_body": {...}}
        normalized.pop("extra_body", None)
        normalized = {**legacy_wrapper, **normalized}

    default_chat_template_kwargs = {"enable_thinking": False}
    raw_chat_kwargs = normalized.get("chat_template_kwargs")
    if isinstance(raw_chat_kwargs, dict):
        normalized["chat_template_kwargs"] = {**default_chat_template_kwargs, **raw_chat_kwargs}
    else:
        normalized["chat_template_kwargs"] = default_chat_template_kwargs
    # 某些 OpenAI 兼容后端识别顶层 enable_thinking；这里也统一给出默认关闭。
    normalized["enable_thinking"] = bool(normalized["chat_template_kwargs"].get("enable_thinking", False))
    return normalized


def _strip_reasoning_text(content: str) -> str:
    text = (content or "").strip()
    if not text:
        return ""

    # 常见 think 标签输出
    text = re.sub(r"(?is)<think>.*?</think>", "", text).strip()

    # 常见“先思考再回答”模板，优先截取最终回答段
    markers = ["Final Answer:", "最终回答：", "最终答案：", "Answer:"]
    for marker in markers:
        if marker in text:
            tail = text.split(marker, 1)[1].strip()
            if tail:
                return tail
    return text


def call_openai_compatible_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.2,
    max_tokens: int = 800,
    timeout_seconds: int = 60,
    extra_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    payload.update(_normalize_extra_body(extra_body))

    response = requests.post(endpoint, headers=headers, json=payload, timeout=timeout_seconds)
    response.raise_for_status()
    data = response.json()

    choices = data.get("choices", [])
    message_content = ""
    if choices and isinstance(choices, list):
        first = choices[0] or {}
        message = first.get("message", {})
        if isinstance(message, dict):
            content = message.get("content", "")
            if isinstance(content, str):
                message_content = _strip_reasoning_text(content)
            elif isinstance(content, list):
                text_blocks: list[str] = []
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text" and isinstance(block.get("text"), str):
                        text_blocks.append(block["text"])
                message_content = _strip_reasoning_text("\n".join(text_blocks))
            else:
                message_content = _strip_reasoning_text(str(content or ""))

    return {
        "request": {
            "endpoint": endpoint,
            "headers": {
                "Content-Type": "application/json",
                "Authorization": "Bearer ***" if api_key.strip() else "",
            },
            "payload": payload,
            "timeout_seconds": timeout_seconds,
        },
        "response": {
            "status_code": response.status_code,
            "body": data,
        },
        "answer": message_content,
    }
