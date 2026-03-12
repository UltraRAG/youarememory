from __future__ import annotations

import json
import re
from typing import TypeVar

T = TypeVar("T")


def truncate(text: str, max_length: int) -> str:
    if not text:
        return ""
    if max_length <= 0 or len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def score_match(query: str, text: str) -> float:
    q = normalize_text(query).lower()
    t = normalize_text(text).lower()
    if not q or not t:
        return 0.0
    if t == q:
        return 1.0
    if t.startswith(q):
        return 0.92
    if q in t:
        return 0.82

    q_words = [w for w in q.split(" ") if w]
    if not q_words:
        return 0.0
    hits = sum(1 for word in q_words if word in t)
    word_score = (hits / len(q_words)) * 0.7

    q_compact = re.sub(r"\s+", "", q)
    t_compact = re.sub(r"\s+", "", t)
    if len(q_compact) < 2 or len(t_compact) < 2:
        return word_score

    gram_hits = 0
    grams = 0
    for i in range(0, len(q_compact) - 1):
        gram = q_compact[i : i + 2]
        grams += 1
        if gram in t_compact:
            gram_hits += 1
    gram_score = (gram_hits / grams) * 0.75 if grams > 0 else 0.0
    return max(word_score, gram_score)


def safe_json_parse(raw: str, fallback: T) -> T:
    try:
        return json.loads(raw)
    except Exception:
        return fallback
