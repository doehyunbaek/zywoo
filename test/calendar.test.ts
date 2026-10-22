import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar } from "../src/index.js";
import { getVitalityMatches, matchToEvent, type PandaMatch } from "../src/scrape.js";

const match: PandaMatch = {
  id: 123, name: "Vitality vs. Spirit", status: "not_started",
  scheduled_at: "2026-10-05T18:30:00Z", begin_at: null,
  modified_at: "2026-10-04T10:00:00Z",
  opponents: [{ opponent: { id: 99, name: "Vitality" } }, { opponent: { id: 100, name: "Spirit" } }],
  results: [], league: { name: "IEM" }, tournament: { name: "Playoffs" },
};
const now = new Date("2026-10-04T12:00:00Z");

function mockFetch(routes: Record<string, unknown>, status = 200): typeof fetch {
  return (async (input, init) => {
    const url = new URL(String(input));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-token");
    if (url.pathname.includes("matches")) assert.equal(url.searchParams.get("filter[opponent_id]"), "99");
    return new Response(JSON.stringify(routes[url.pathname] ?? []), { status });
  }) as typeof fetch;
}

const routes = {
  "/csgo/teams": [{ id: 99, name: "Vitality" }],
  "/csgo/matches/upcoming": [match],
  "/csgo/matches/running": [],
  "/csgo/matches/past": [],
};

test("rescheduling keeps the UID; undated and canceled matches are omitted", () => {
  const original = matchToEvent(match)!;
  const moved = matchToEvent({ ...match, scheduled_at: "2026-10-06T18:30:00Z" })!;
  assert.equal(original.uid, moved.uid);
  assert.notEqual(original.date, moved.date);
  assert.equal(matchToEvent({ ...match, scheduled_at: null }), null);
  assert.equal(matchToEvent({ ...match, status: "canceled" }), null);
});

test("calendar has UTC dates, deterministic stamps and stable UIDs", () => {
  const event = matchToEvent(match)!;
  const calendar = buildCalendar([event]);
  assert.match(calendar, /DTSTART:20261005T183000Z/);
  assert.match(calendar, /DTSTAMP:20261004T100000Z/);
  assert.match(calendar, /LAST-MODIFIED:20261004T100000Z/);
  assert.doesNotMatch(calendar, /Vitality: 0/);
  assert.match(calendar, /UID:pandascore-match-123@vitality-cal/);
  assert.match(calendar, /SUMMARY:Vitality vs\. Spirit/);
  assert.equal(calendar, buildCalendar([event]));
  assert.throws(() => buildCalendar([]), /No events/);
});

test("API resolves the CS2 team and deduplicates match IDs", async () => {
  const events = await getVitalityMatches({ token: "test-token", now, fetch: mockFetch({ ...routes, "/csgo/matches/running": [match] }) });
  assert.equal(events.length, 1);
});

test("missing credentials and HTTP failures fail clearly", async () => {
  await assert.rejects(getVitalityMatches({ token: "" }), /PANDASCORE_TOKEN/);
  await assert.rejects(getVitalityMatches({ token: "test-token", fetch: mockFetch({}, 403) }), /HTTP 403/);
});

test("empty, stale, unrelated and ambiguous data fail without producing a calendar", async () => {
  const options = { token: "test-token", now };
  await assert.rejects(getVitalityMatches({ ...options, fetch: mockFetch({ ...routes, "/csgo/matches/upcoming": [] }) }), /no dated/);
  await assert.rejects(getVitalityMatches({ ...options, fetch: mockFetch({ ...routes, "/csgo/matches/upcoming": [{ ...match, scheduled_at: "2026-01-01T12:00:00Z" }] }) }), /45 days/);
  await assert.rejects(getVitalityMatches({ ...options, fetch: mockFetch({ ...routes, "/csgo/matches/upcoming": [{ ...match, opponents: [] }] }) }), /without Vitality/);
  await assert.rejects(getVitalityMatches({ ...options, fetch: mockFetch({ ...routes, "/csgo/teams": [] }) }), /uniquely resolve/);
});
