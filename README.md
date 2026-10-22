# Vitality CS2 calendar

An automatically refreshed calendar of Team Vitality's Counter-Strike matches,
using PandaScore's supported API rather than scraping bot-protected websites.

Subscribe to the existing feed (the URL does not change):

```text
webcal://raw.githubusercontent.com/doehyunbaek/vitality-cal/ics/Vitality.ics
```

## Setup

1. Create an account at https://app.pandascore.co/ and get an API token. PandaScore
   currently lists schedules/results/context data as free, with 1,000 requests/hour:
   https://www.pandascore.co/pricing. Verify Counter-Strike access for your account.
2. Add the token as the repository Actions secret `PANDASCORE_TOKEN`:
   ```sh
   gh secret set PANDASCORE_TOKEN
   ```
   This prompts for the value; do not commit tokens or paste them into chat.
3. Push these changes to `main`, then manually run **Update Vitality calendar**.
   The workflow is scheduled at the start of every hour (UTC). GitHub Actions
   may delay scheduled runs, especially at the top of the hour.
4. Compare the logged upcoming-match count and generated feed with
   https://www.hltv.org/team/9565/vitality#tab-matchesBox to verify coverage.
   A local authenticated test on October 4, 2026 returned 96 dated matches,
   including Vitality vs. Natus Vincere at 16:30 UTC that day. Two consecutive
   runs produced identical feeds. Completeness against HLTV remains unverified
   because HLTV blocks requests from this environment.
5. Enable GitHub Actions failure notifications under your GitHub notification
   settings. Workflow failures leave the previous published calendar intact.

The workflow runs code from `main` and commits only `Vitality.ics` to `ics`.
No-change runs succeed. Failed requests, invalid data, no dated matches, or coverage
older than 45 days fail the update instead of overwriting the feed. The freshness
check is a safeguard, not proof that PandaScore lists every upcoming match.

## Local development

Node.js 22+:

```sh
npm ci
npm test
npm run typecheck
# Supply PANDASCORE_TOKEN securely in your environment, then:
npm start
```

`CALENDAR_OUTPUT` optionally selects an output path. The file is replaced only
once retrieval and ICS validation succeed. No browser installation is needed.

The generator resolves Vitality through `/csgo/teams`, then queries upcoming,
running, and the latest 100 past matches using `filter[opponent_id]`. Undated and
canceled matches are omitted. Start times use UTC; durations are estimated at
three hours. PandaScore match IDs give stable UIDs across rescheduling, and provider
modification timestamps keep unchanged output deterministic.

Switching providers changes event UIDs once. Past matches outside the latest 100
are no longer included; this feed is not a permanent historical archive.

API reference: https://developers.pandascore.co/reference/get_csgo_matches_upcoming-1
