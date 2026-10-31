// Refresh recent maps from an HLTV player-history tab opened in a CDP browser.
// Complete any browser challenge manually before running this script.
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { datasetPath, readDataset } from './zywoo-dataset.mjs';

const endpoint = process.env.CDP_URL || 'http://127.0.0.1:9222';
const history = await readDataset();
const tabs = await (await fetch(`${endpoint}/json/list`)).json();
const tab = tabs.find(t => t.type === 'page' && t.url === history.source);
if (!tab) throw Error(`Open ${history.source} in the remote-debugging browser first.`);
const ws = new WebSocket(tab.webSocketDebuggerUrl);
try {
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('CDP timeout')), 15000);
    ws.onmessage = e => {
      const message = JSON.parse(e.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      if (message.error || message.result.exceptionDetails) reject(Error('Unable to read player history'));
      else resolve(message.result.result.value);
    };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      returnByValue: true,
      expression: `(() => {
        const total = document.body.innerText.match(/1\\s*-\\s*100 of ([\\d,]+)/);
        return {
          expectedMaps: total ? Number(total[1].replaceAll(',', '')) : null,
          maps: [...document.querySelectorAll('tbody tr')].map(r => {
            const c = r.cells;
            const a = c[0]?.querySelector('a[href*="/mapstatsid/"]');
            if (!a) return null;
            const team = c[1].querySelector('.gtSmartphone-only');
            const opponent = c[2].querySelector('.gtSmartphone-only');
            const kd = c[4].textContent.trim().match(/^(\\d+)\\s*-\\s*(\\d+)$/);
            return {
              date: new Date(Number(c[0].querySelector('[data-unix]').dataset.unix)).toISOString().slice(0,10),
              team: team.querySelector('a').textContent.trim(),
              teamScore: Number(team.textContent.match(/\\((\\d+)\\)/)[1]),
              opponent: opponent.querySelector('a').textContent.trim(),
              opponentScore: Number(opponent.textContent.match(/\\((\\d+)\\)/)[1]),
              map: c[3].textContent.trim(), kills: Number(kd[1]), deaths: Number(kd[2]),
              differential: Number(c[5].textContent.trim()),
              rating: c[6].textContent.trim() === '-' ? null : Number(c[6].textContent.trim()),
              mapStatsId: Number(a.href.split('/mapstatsid/')[1].split('/')[0]), url: a.href
            };
          }).filter(Boolean)
        };
      })()`
    } }));
  });
  if (!result.expectedMaps || result.maps.length !== 100) throw Error('History table unavailable or incomplete; dataset unchanged.');
  const known = new Set(history.maps.map(m => m.mapStatsId));
  const added = result.maps.filter(m => !known.has(m.mapStatsId));
  if (!result.maps.some(m => known.has(m.mapStatsId)) || history.maps.length + added.length !== result.expectedMaps) {
    throw Error('Recent page does not cover all missing maps; full pagination required. Dataset unchanged.');
  }
  for (const m of result.maps) {
    if (!m.team || !m.opponent || !m.map || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) ||
        !['mapStatsId', 'kills', 'deaths', 'teamScore', 'opponentScore'].every(k => Number.isInteger(m[k]) && m[k] >= 0) ||
        m.differential !== m.kills - m.deaths || (m.rating !== null && (!Number.isFinite(m.rating) || m.rating < 0))) {
      throw Error('Invalid source row; dataset unchanged.');
    }
  }
  if (new Set(result.maps.map(m => m.mapStatsId)).size !== result.maps.length) throw Error('Duplicate source IDs');
  if (!added.length) { console.log('No new maps.'); }
  else {
    // Preserve historical records and evidence; only append previously unseen IDs.
    history.maps = [...added, ...history.maps];
    history.expectedMaps = result.expectedMaps;
    history.complete = true;
    history.retrievedAt = new Date().toISOString();
    const temporary = new URL(`../data/.zywoo-history-${randomUUID()}.tmp`, import.meta.url);
    try {
      await fs.writeFile(temporary, JSON.stringify(history, null, 2) + '\n');
      await fs.rename(temporary, datasetPath);
    } finally { await fs.rm(temporary, { force: true }); }
    console.log(`Added ${added.length} maps; ${history.maps.length} total through ${history.maps[0].date}.`);
  }
} finally { ws.close(); }
