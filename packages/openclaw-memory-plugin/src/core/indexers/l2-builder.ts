import type { L1WindowRecord, L2ProjectIndexRecord, L2TimeIndexRecord } from "../types.js";
import { buildL2ProjectIndexId, buildL2TimeIndexId, nowIso } from "../utils/id.js";
import type { SkillsRuntime } from "../skills/types.js";

function parseDateKey(timePeriod: string): string {
  const idx = timePeriod.indexOf(":");
  return idx >= 0 ? timePeriod.slice(0, idx) : timePeriod;
}

function deriveProjectStatus(summary: string, skills: SkillsRuntime): string {
  const lower = summary.toLowerCase();
  for (const rule of skills.projectStatusRules.rules) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return rule.status;
      }
    }
  }
  return skills.projectStatusRules.defaultStatus;
}

export function buildL2TimeFromL1(l1: L1WindowRecord): L2TimeIndexRecord {
  const dateKey = parseDateKey(l1.timePeriod);
  const now = nowIso();
  return {
    l2IndexId: buildL2TimeIndexId(dateKey),
    dateKey,
    summary: l1.summary,
    l1Source: [l1.l1IndexId],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildL2ProjectsFromL1(l1: L1WindowRecord, skills: SkillsRuntime): L2ProjectIndexRecord[] {
  const now = nowIso();
  return l1.projectTags.map((projectName) => ({
    l2IndexId: buildL2ProjectIndexId(projectName),
    projectName,
    summary: `${projectName}：${l1.summary}`,
    currentStatus: deriveProjectStatus(l1.summary, skills),
    latestProgress: l1.situationTimeInfo,
    l1Source: [l1.l1IndexId],
    createdAt: now,
    updatedAt: now,
  }));
}
