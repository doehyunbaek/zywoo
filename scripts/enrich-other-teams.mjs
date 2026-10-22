import { readDataset, updateEvidence } from './zywoo-dataset.mjs';
const root='http://127.0.0.1:9222';
const history=await readDataset();
const tournaments=history.evidence.tournaments;
const placements=history.evidence.placements;
const known=new Set(tournaments.maps.map(m=>m.mapStatsId));
const missing=history.maps.filter(m=>!known.has(m.mapStatsId));
const wanted=new Set(missing.map(m=>m.mapStatsId));
const tab=await(await fetch(`${root}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let n=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
function call(method,params){return new Promise((r,j)=>{const id=++n;const timer=setTimeout(()=>{pending.delete(id);j(Error('CDP timeout'));},20000);pending.set(id,m=>{clearTimeout(timer);m.error?j(Error(m.error.message)):r(m.result);});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function visit(url){await call('Page.navigate',{url});for(let i=0;i<25;i++){await pause(1000);if(await evaluate("!!document.querySelector('tbody tr')"))return;}throw Error(`No table available: ${url}`);}
async function save(){await updateEvidence({ tournaments, placements });}
try{
 const teams=new Map();
 const offsets=[...new Set(history.maps.map((m,i)=>wanted.has(m.mapStatsId)?Math.floor(i/100)*100:null).filter(x=>x!==null))];
 for(const offset of offsets){
  await visit(`https://www.hltv.org/stats/players/matches/11893/zywoo?offset=${offset}`);
  const rows=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('tbody tr')].map(r=>{const a=r.cells[0]?.querySelector('a[href*="/mapstatsid/"]');const t=r.cells[1]?.querySelector('a[href*="/stats/teams/"]');if(!a||!t)return null;return {mapStatsId:Number(a.href.split('/mapstatsid/')[1].split('/')[0]),teamId:Number(t.href.split('/teams/')[1].split('/')[0]),name:t.textContent.trim(),url:t.href};}).filter(Boolean))`));
  for(const r of rows)if(wanted.has(r.mapStatsId))teams.set(r.teamId,{id:r.teamId,name:r.name,url:r.url});
  console.log(`Player offset ${offset}: ${teams.size} teams identified`);await pause(1200);
 }
 for(const team of teams.values()){
  const slug=team.url.split('/teams/')[1];
  const source=`https://www.hltv.org/stats/teams/matches/${slug}`;
  try{
   await visit(source);
   const rows=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('tbody tr')].map(r=>{const a=r.querySelector('a[href*="/mapstatsid/"]');const e=r.querySelector('a[href*="?event="]');if(!a||!e)return null;return {mapStatsId:Number(a.href.split('/mapstatsid/')[1].split('/')[0]),tournament:{id:Number(new URL(e.href).searchParams.get('event')),name:e.textContent.trim(),statsUrl:e.href},mapUrl:a.href};}).filter(Boolean))`));
   const retrievedAt=new Date().toISOString();let added=0;
   for(const row of rows)if(wanted.has(row.mapStatsId)&&!known.has(row.mapStatsId)&&row.tournament.id&&row.tournament.name){tournaments.maps.push({...row,teamId:team.id,evidence:{sourceUrl:source,retrievedAt,method:'Exact mapStatsId join from team map-history row'}});known.add(row.mapStatsId);added++;}
   await save();console.log(`${team.name} (${team.id}): ${added} maps joined`);await pause(1200);
   const eventSource=`https://www.hltv.org/stats/teams/events/${slug}`;await visit(eventSource);
   const events=JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('tbody tr')].map(r=>{const e=r.querySelector('a[href*="?event="]');if(!e)return null;return {tournamentId:Number(new URL(e.href).searchParams.get('event')),tournamentName:e.textContent.trim(),team:r.cells[2]?.textContent.trim(),placing:r.cells[0].textContent.trim(),evidence:{sourceUrl:location.href,eventStatsUrl:e.href,observedText:r.textContent.trim()}};}).filter(Boolean))`));
   for(const e of events){if(!e.tournamentId||!e.placing)continue;if(placements.placements.some(p=>p.teamId===team.id&&p.tournamentId===e.tournamentId))continue;e.teamId=team.id;e.evidence.retrievedAt=new Date().toISOString();e.evidence.method='Explicit placing cell in HLTV attended-events row; joined by tournamentId and teamId';placements.placements.push(e);}
   await save();await pause(1200);
  }catch(e){console.warn(`${team.name}: ${e.message}`);}
 }
 console.log(`Coverage: ${known.size}/${history.maps.length} maps`);
}finally{ws.close();await fetch(`${root}/json/close/${tab.id}`);}
