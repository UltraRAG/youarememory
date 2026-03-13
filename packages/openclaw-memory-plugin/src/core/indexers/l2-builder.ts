import type { L1WindowRecord, L2ProjectIndexRecord, L2TimeIndexRecord } from "../types.js";
import { buildL2ProjectIndexId, buildL2TimeIndexId, nowIso } from "../utils/id.js";

function parseDateKey(timePeriod: string): string {
  const idx = timePeriod.indexOf(":");
  return idx >= 0 ? timePeriod.slice(0, idx) : timePeriod;
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

export function buildL2ProjectsFromL1(l1: L1WindowRecord): L2ProjectIndexRecord[] {
  const now = nowIso();
  return l1.projectDetails.map((project) => ({
    l2IndexId: buildL2ProjectIndexId(project.key),
    projectKey: project.key,
    projectName: project.name,
    summary: project.summary || `${project.name}: ${l1.summary}`,
    currentStatus: project.status,
    latestProgress: project.latestProgress || l1.situationTimeInfo,
    l1Source: [l1.l1IndexId],
    createdAt: now,
    updatedAt: now,
  }));
}
