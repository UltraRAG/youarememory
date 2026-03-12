#!/usr/bin/env node
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { MemoryRepository, ReasoningRetriever, loadSkillsRuntime } from "../dist/core/index.js";

function parseArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function toLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const dbPath = resolve(parseArg("--db", join(homedir(), ".openclaw", "youarememory", "memory.sqlite")));
const query = parseArg("--query", "");
const limit = toLimit(parseArg("--limit", "6"), 6);
const skillsDirRaw = parseArg("--skills-dir", "");
const includeFacts = parseArg("--include-facts", "true").toLowerCase() !== "false";

if (!query.trim()) {
  console.error(JSON.stringify({ ok: false, error: "query is required" }, null, 2));
  process.exit(1);
}

const repository = new MemoryRepository(dbPath);
try {
  const silentLogger = {
    info() {},
    warn() {},
  };
  const skills = skillsDirRaw
    ? loadSkillsRuntime({ skillsDir: resolve(skillsDirRaw), logger: silentLogger })
    : loadSkillsRuntime({ logger: silentLogger });
  const retriever = new ReasoningRetriever(repository, skills);
  const result = retriever.retrieve(query, {
    l2Limit: limit,
    l1Limit: limit,
    l0Limit: Math.max(3, Math.floor(limit / 2)),
    includeFacts,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: "ts-plugin-debug",
        dbPath,
        query,
        limit,
        includeFacts,
        result,
      },
      null,
      2,
    ),
  );
} finally {
  repository.close();
}
