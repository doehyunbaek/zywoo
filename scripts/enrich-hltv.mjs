// Run with Brave remote debugging enabled: node scripts/enrich-hltv.mjs [series limit]
// Updates resumable match evidence in the single dataset, preserving raw maps.
import { readDataset, updateEvidence } from './zywoo-dataset.mjs';
const endpoint = process.env.CDP_URL || 'http://127.0.0.1:9222';
const limit = Number(process.argv[2] || 10);
if (!Number.isInteger(limit) || limit < 1) throw Error('Limit must be a positive integer');
const history = await readDataset();
const output = 'data/zywoo-history.json';
const evidence = history.evidence?.matches || { source: 'HLTV map stats and match pages', matches: [] };
const tab = await (await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if(pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function call(method, params) { return new Promise((resolve,reject) => { const n=++id; const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout'));},15000);pending.set(n,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result);});ws.send(JSON.stringify({id:n,method,params})); }); }
async function evaluate(expression) { const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value; }
const pause = ms => new Promise(r=>setTimeout(r,ms));
async function visit(url, selector) {
 if(!/^https:\/\/www\.hltv\.org\//.test(url))throw Error('Unexpected URL');
 await call('Page.navigate',{url});
 for(let n=0;n<20;n++){await pause(1000);if(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`))return;}
 throw Error(`Page unavailable or blocked: ${url}. No challenge bypass attempted.`);
}
try {
 let count=0;
 for(const map of history.maps) {
  if(count>=limit)break;
  if(evidence.matches.some(m=>m.mapStatsIds.includes(map.mapStatsId)))continue;
  await visit(map.url,'.match-page-link');
  const stats=await evaluate(`JSON.stringify({matchUrl:document.querySelector('.match-page-link').href,mapStatsIds:[...new Set([...document.querySelectorAll('a[href]')].filter(a=>a.textContent.includes(' - ')&&a.href.includes('/mapstatsid/')).map(a=>Number(a.href.split('/mapstatsid/')[1].split('/')[0])))],format:document.body.innerText.match(/Best of [135]/)?.[0]})`);
  const s=JSON.parse(stats);
  if(!s.mapStatsIds.includes(map.mapStatsId))throw Error('Source map not found in series list');
  await visit(s.matchUrl,'.event a');
  const match=JSON.parse(await evaluate(`JSON.stringify({tournament:{id:Number(document.querySelector('.event a').href.split('/events/')[1].split('/')[0]),name:document.querySelector('.event a').textContent.trim(),url:document.querySelector('.event a').href},mapStatsIds:[...new Set([...document.querySelectorAll('a[href]')].filter(a=>a.href.includes('/mapstatsid/')).map(a=>Number(a.href.split('/mapstatsid/')[1].split('/')[0])))],teams:[...document.querySelectorAll('.team1-gradient,.team2-gradient')].map(e=>({name:e.querySelector('.teamName')?.textContent.trim(),score:e.querySelector('.won,.lost')?.textContent.trim()}))})`));
  if(!s.mapStatsIds.every(id=>match.mapStatsIds.includes(id)))throw Error('Match page does not corroborate map IDs');
  const record={matchId:Number(s.matchUrl.split('/matches/')[1].split('/')[0]),matchUrl:s.matchUrl,tournament:match.tournament,bestOf:Number(s.format?.match(/\d/)?.[0])||null,teams:match.teams,mapStatsIds:s.mapStatsIds,complete:s.mapStatsIds.every(id=>history.maps.some(m=>m.mapStatsId===id)),evidence:{mapUrl:map.url,matchUrl:s.matchUrl,retrievedAt:new Date().toISOString(),status:'map-ids-corroborated'}};
  if(!record.tournament.id||!record.tournament.name||!record.matchId)throw Error('Missing identifiers');
  evidence.matches.push(record);
  await updateEvidence({ matches: evidence });
  console.log(`${record.matchId}: ${record.tournament.name} · ${record.mapStatsIds.length} maps corroborated`);
  count++;await pause(2000);
 }
 console.log(`Saved ${evidence.matches.length} verified series to ${output}`);
} finally { ws.close(); await fetch(`${endpoint}/json/close/${tab.id}`); }
