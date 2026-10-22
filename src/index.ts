import { getVitalityMatches } from "./scrape.js";
import { renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createEvents, type DateArray, type EventAttributes } from "ics";

function utcDate(value: string): DateArray {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid calendar date: ${value}`);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes()];
}

export function formatEventForCalendar(event: CalendarMatch): EventAttributes & { timestamp: string } {
  return {
    start: utcDate(event.date),
    startInputType: "utc",
    startOutputType: "utc",
    duration: { hours: 3 },
    title: event.name,
    description: event.description,
    uid: event.uid,
    url: event.url,
    calName: "Vitality CS2",
    // Use provider timestamps, not the run time, to keep unchanged feeds identical.
    timestamp: new Date(event.updatedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"),
  };
}

export function buildCalendar(events: CalendarMatch[]): string {
  if (!events.length) throw new Error("No events retrieved");
  const { error, value } = createEvents(events.map(formatEventForCalendar));
  if (error || !value) throw error ?? new Error("ICS generation returned no data");
  // ics formats lastModified arrays as local time. Reuse the explicit UTC stamp.
  return value.replace(/DTSTAMP:([^\r\n]+)\r\n/g, "DTSTAMP:$1\r\nLAST-MODIFIED:$1\r\n");
}

export async function createICS() {
  const calendar = buildCalendar(await getVitalityMatches());
  const output = process.env.CALENDAR_OUTPUT ?? "Vitality.ics";
  writeFileSync(`${output}.tmp`, calendar);
  renameSync(`${output}.tmp`, output);
  console.log(`Updated ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createICS().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
