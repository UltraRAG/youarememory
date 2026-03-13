import type { L0SessionRecord, L1WindowRecord } from "../types.js";
import { buildL1IndexId, nowIso } from "../utils/id.js";
import { LlmMemoryExtractor } from "../skills/llm-extraction.js";

function buildTimePeriod(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "unknown";
  const day = date.toISOString().slice(0, 10);
  const startHour = date.getHours() - (date.getHours() % 2);
  const endHour = startHour + 2;
  const hh = (value: number): string => String(value).padStart(2, "0");
  return `${day}:T${hh(startHour)}:00-${hh(Math.min(endHour, 24))}:00`;
}

export async function extractL1FromL0(
  record: L0SessionRecord,
  extractor: LlmMemoryExtractor,
): Promise<L1WindowRecord> {
  const extracted = await extractor.extract({
    timestamp: record.timestamp,
    messages: record.messages,
  });
  const l1IndexId = buildL1IndexId(record.timestamp, [record.l0IndexId]);
  return {
    l1IndexId,
    timePeriod: buildTimePeriod(record.timestamp),
    summary: extracted.summary,
    facts: extracted.facts,
    situationTimeInfo: extracted.situationTimeInfo,
    projectTags: extracted.projectDetails.map((item) => item.name),
    projectDetails: extracted.projectDetails,
    l0Source: [record.l0IndexId],
    createdAt: nowIso(),
  };
}
