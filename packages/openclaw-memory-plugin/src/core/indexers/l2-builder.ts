import type {
  IndexingSettings,
  L1WindowRecord,
  L2ProjectIndexRecord,
  L2TimeIndexRecord,
  L2TimeGranularity,
} from "../types.js";
import { buildL2ProjectIndexId, buildL2TimeIndexId, nowIso } from "../utils/id.js";

function bucketStart(date: Date, granularity: L2TimeGranularity): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  if (granularity === "day") {
    next.setHours(0, 0, 0, 0);
    return next;
  }
  if (granularity === "half_day") {
    next.setHours(next.getHours() < 12 ? 0 : 12, 0, 0, 0);
    return next;
  }
  return next;
}

function formatBucketKey(date: Date, granularity: L2TimeGranularity): string {
  const yyyyMmDd = date.toISOString().slice(0, 10);
  const hh = String(date.getHours()).padStart(2, "0");
  if (granularity === "day") {
    return yyyyMmDd;
  }
  if (granularity === "half_day") {
    const endHour = date.getHours() < 12 ? "12" : "24";
    return `${yyyyMmDd} ${hh}:00-${endHour}:00`;
  }
  return `${yyyyMmDd} ${hh}:00`;
}

export function buildL2TimeFromL1(
  l1: L1WindowRecord,
  settings: Pick<IndexingSettings, "l2TimeGranularity">,
): L2TimeIndexRecord {
  const granularity = settings.l2TimeGranularity;
  const start = bucketStart(new Date(l1.startedAt), granularity);
  const dateKey = Number.isNaN(start.getTime())
    ? l1.startedAt.slice(0, 10) || l1.timePeriod
    : formatBucketKey(start, granularity);
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
