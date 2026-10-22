const API = "https://api.pandascore.co";

type Team = { id: number; name: string };
export type PandaMatch = {
  id: number;
  name: string;
  status: string;
  scheduled_at: string | null;
  begin_at: string | null;
  modified_at: string;
  opponents: { opponent: Team }[];
  results: { team_id: number; score: number }[];
  league: { name: string; url?: string | null };
  tournament: { name: string };
};

export function matchToEvent(match: PandaMatch): CalendarMatch | null {
  // Do not invent a time for undated matches or publish canceled matches.
  const date = match.begin_at || match.scheduled_at;
  if (match.status === "canceled" || !date) return null;
  if (!Number.isFinite(Date.parse(date)) || !Number.isFinite(Date.parse(match.modified_at))) {
    throw new Error(`Invalid timestamps for PandaScore match ${match.id}`);
  }
  const teams = match.opponents.map(({ opponent }) => opponent);
  const result = match.status === "finished" ? teams.map((team) => {
    const score = match.results.find((result) => result.team_id === team.id)?.score;
    return `${team.name}: ${score ?? "TBD"}`;
  }).join("; ") : "";
  return {
    uid: `pandascore-match-${match.id}@vitality-cal`,
    name: teams.length === 2 ? teams.map((team) => team.name).join(" vs. ") : match.name,
    date,
    updatedAt: match.modified_at,
    description: [match.league.name, match.tournament.name, `Status: ${match.status}`, result].filter(Boolean).join("\n"),
    url: match.league.url || undefined,
  };
}

export async function getVitalityMatches(options: {
  token?: string;
  fetch?: typeof fetch;
  now?: Date;
} = {}): Promise<CalendarMatch[]> {
  const token = options.token ?? process.env.PANDASCORE_TOKEN;
  if (!token) throw new Error("Set PANDASCORE_TOKEN (PandaScore's free schedules plan is sufficient)");
  const request = options.fetch ?? fetch;
  const now = options.now ?? new Date();

  async function get<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const url = new URL(`${API}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`PandaScore ${path}: HTTP ${response.status} (check token and CS2 plan access)`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error(`PandaScore ${path}: expected an array`);
      return data as T[];
    }
    throw new Error(`PandaScore ${path}: retries exhausted`);
  }

  // Resolve the CS2 team rather than confusing PandaScore IDs with HLTV IDs.
  const teams = await get<Team>("/csgo/teams", { "filter[name]": "Vitality", per_page: "100" });
  const team = teams[0];
  if (teams.length !== 1 || !team || team.name !== "Vitality" || !Number.isSafeInteger(team.id)) {
    throw new Error("Could not uniquely resolve Vitality's Counter-Strike team in PandaScore");
  }
  const teamId = team.id;
  const matches = new Map<number, PandaMatch>();
  for (const category of ["upcoming", "running", "past"]) {
    for (let page = 1; page <= 10; page++) {
      const batch = await get<PandaMatch>(`/csgo/matches/${category}`, {
        "filter[opponent_id]": String(teamId),
        sort: category === "past" ? "-begin_at" : "scheduled_at",
        per_page: "100",
        page: String(page),
      });
      for (const match of batch) {
        if (!Number.isSafeInteger(match.id) || !match.opponents.some(({ opponent }) => opponent.id === teamId)) {
          throw new Error("PandaScore returned an invalid match or a match without Vitality");
        }
        matches.set(match.id, match);
      }
      // Keep the latest 100 results, and all upcoming/running matches.
      if (category === "past" || batch.length < 100) break;
      if (page === 10) throw new Error("PandaScore pagination limit reached; refusing a truncated calendar");
    }
  }
  const events = [...matches.values()].map(matchToEvent).filter((event): event is CalendarMatch => event !== null);
  if (!events.length) throw new Error("PandaScore returned no dated Vitality matches; keeping the existing calendar");
  if (!events.some((event) => Date.parse(event.date) >= now.getTime() - 45 * 86400_000)) {
    throw new Error("PandaScore match coverage is over 45 days old; keeping the existing calendar");
  }
  console.log(`PandaScore: ${events.length} dated Vitality matches, ${events.filter((event) => Date.parse(event.date) > now.getTime()).length} upcoming`);
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
}
