---
name: memory-orchestrator
description: Orchestrate YouAreMemory retrieval using memory_recall and fallback search_l2/search_l1/search_l0. Use when the user asks for historical context, project progress, timeline, or profile facts.
metadata: {"openclaw":{"skillKey":"youarememory-openclaw","requires":{"config":["plugins.entries.youarememory-openclaw.enabled"]}}}
---

# Memory Orchestrator

Use this skill when the task depends on conversation history, project status, timeline, or user profile facts.

## Primary Path (Tool-first)

1. Call `memory_recall` with the user's question.
2. Read `intent`, `enoughAt`, and returned context.
3. If `enoughAt` is `l2`, `l1`, or `l0`, answer using returned evidence.
4. If `enoughAt` is `none`, run explicit fallback:
   - call `search_l2`
   - if still weak, call `search_l1`
   - if still weak, call `search_l0`

## Fallback Strategy

- Time-oriented question: prioritize `search_l2` with `type: "time"`.
- Project-oriented question: prioritize `search_l2` with `type: "project"`.
- Fact/profile question: run `memory_recall` first, then `search_l1` and `search_l0` only if needed.

## Tool Usage Notes

- Prefer concise query strings; avoid overly long prompt copies.
- Keep `limit` small (default 6 to 8) unless user explicitly asks for exhaustive history.
- If data appears contradictory, cite recent L0/L1 evidence in your answer.

## Minimal Example

```text
User asks: "我这个项目最近进展到哪里了？"
1) memory_recall({ query: "项目最近进展", limit: 6 })
2) if enoughAt=none -> search_l2({ query: "项目最近进展", type: "project", limit: 8 })
3) if still weak -> search_l1({ query: "项目最近进展", limit: 8 })
4) if still weak -> search_l0({ query: "项目最近进展", limit: 6 })
```

## Guardrails

- Do not fabricate details not supported by retrieved memory.
- Prefer newer entries over older ones when there is conflict.
- If retrieval is empty, state uncertainty clearly and ask a targeted follow-up question.
