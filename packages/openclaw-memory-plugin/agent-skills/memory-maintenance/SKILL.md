---
name: memory-maintenance
description: Diagnose and maintain ClawXMemory index health using scripts and tools. Use when installation, indexing, or data quality looks wrong.
metadata: {"openclaw":{"skillKey":"clawxmemory-openclaw","requires":{"config":["plugins.entries.clawxmemory-openclaw.enabled"]}}}
---

# Memory Maintenance

Use this skill for diagnosis and maintenance of ClawXMemory storage/indexes.

## Mixed Mode Policy

- Prefer tool calls for normal user-facing retrieval flows.
- Use scripts only for diagnostics, data checks, and troubleshooting.

## Recommended Workflow

1. Read current memory behavior with tools:
   - `memory_recall`
   - `search_l2`, `search_l1`, `search_l0`
2. If behavior is suspicious, run scripts:
   - `node {baseDir}/scripts/inspect-indexes.mjs --db <path>`
   - `node {baseDir}/scripts/recent-sessions.mjs --db <path> --limit 5`
3. Compare script output with tool output.
4. Report concrete findings:
   - missing data
   - stale indexing
   - low extraction quality
   - query mismatch

## Script Defaults

- Default DB path: `~/.openclaw/clawxmemory/memory.sqlite`
- You can override with `--db /absolute/path/to/memory.sqlite`

## Common Debug Cases

- Install succeeds but recall empty: check table counts and `lastIndexedAt`.
- Project answers weak: inspect `l2_project_indexes` and recent `l1_windows`.
- Timeline mismatch: inspect `l2_time_indexes` versus latest `l0_sessions`.

## Guardrails

- Scripts are read-only diagnostics in this skill.
- Do not modify DB directly from this skill unless user explicitly asks for data repair.
