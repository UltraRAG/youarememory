from __future__ import annotations


def classify_intent(query: str, skills: dict) -> str:
    normalized = query.lower()
    intent_rules = skills["intentRules"]
    score = {
        "time": len([word for word in intent_rules["timeKeywords"] if word.lower() in normalized]),
        "project": len([word for word in intent_rules["projectKeywords"] if word.lower() in normalized]),
        "fact": len([word for word in intent_rules["factKeywords"] if word.lower() in normalized]),
    }

    if score["project"] > 0 and score["project"] >= score["time"] and score["project"] >= score["fact"]:
        return "project"
    if score["time"] > 0 and score["time"] >= score["fact"]:
        return "time"
    if score["fact"] > 0:
        return "fact"
    return "general"
