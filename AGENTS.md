# Repository guidance

## Updating ZywOo results

Update `data/zywoo-history.json` with both map results and their supporting evidence. Adding maps alone is not a complete results update.

- Preserve existing historical records and evidence; deduplicate by `mapStatsId`.
- Add tournament assignments to `evidence.tournaments.maps` using exact map IDs and source URLs.
- **Add verified series records to `evidence.matches.matches` for every new match.** Include `matchId`, `matchUrl`, tournament, format, teams/scores, and all series `mapStatsIds`. Corroborate map IDs against both the stats page and match page before setting `evidence.status` to `map-ids-corroborated`. Never invent IDs or mark unverified links as corroborated.
- This series evidence is required for match-level date links: `index.html` only populates `matchUrl` from corroborated match evidence. Tournament evidence and individual map URLs do not provide those links.
- Record verified team placement in `evidence.placements.placements` when available, with its source and retrieval timestamp.
- Update retrieval metadata and map totals. Only claim `complete: true` after checking the unfiltered player-history total and coverage; an event-filtered page alone does not establish career-history completeness.
- Validate unique IDs, map totals, K–D differentials, unchanged historical maps, tournament joins, placements, and series coverage for every new map. Check that new match groups have valid HLTV date links, not just expandable maps.
- If any evidence cannot be retrieved, explicitly report the incomplete portion rather than presenting the update as complete.

## HLTV access

If direct requests are blocked, use the user's Brave browser when authorized. AppleScript requires **View → Developer → Allow JavaScript from Apple Events**. Use a dedicated tab and address it consistently rather than relying on the active tab. Let the user complete any browser challenge manually; do not bypass challenges. Follow the existing scripts' evidence conventions.
