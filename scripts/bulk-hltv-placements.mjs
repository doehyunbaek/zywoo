// Extract explicit team placements from the event-history page open in Brave.
import { readDataset, updateEvidence } from './zywoo-dataset.mjs';
const source='https://www.hltv.org/stats/teams/events/9565/vitality';
const tabs=await(await fetch('http://127.0.0.1:9222/json/list')).json();
const tab=tabs.find(t=>t.url===source);
if(!tab)throw Error(`Open ${source} in remote-debugging Brave first.`);
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
try{
 const response=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout')),15000);ws.onmessage=e=>{clearTimeout(timer);resolve(JSON.parse(e.data));};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression:`JSON.stringify([...document.querySelectorAll('tbody tr')].map(row=>{const event=row.querySelector('a[href*="?event="]');if(!event)return null;return {tournamentId:Number(new URL(event.href).searchParams.get('event')),tournamentName:event.textContent.trim(),teamId:9565,team:row.cells[2]?.textContent.trim(),placing:row.cells[0].textContent.trim(),evidence:{sourceUrl:location.href,eventStatsUrl:event.href,observedText:row.textContent.trim()}};}).filter(Boolean))`}}));});
 if(response.result?.exceptionDetails)throw Error('Extraction failed');
 const placements=JSON.parse(response.result.result.value);
 if(!placements.length||placements.some(r=>!r.tournamentId||r.team!=='Vitality'||!r.placing))throw Error('Invalid placement rows');
 if(new Set(placements.map(r=>r.tournamentId)).size!==placements.length)throw Error('Duplicate event IDs');
 const retrievedAt=new Date().toISOString();
 for(const row of placements){row.evidence.retrievedAt=retrievedAt;row.evidence.method='Explicit placing cell in HLTV attended-events row; joined by tournamentId and teamId';}
 const dataset=await readDataset();
 const existing=dataset.evidence?.placements;
 const merged=[...(existing?.placements||[]).filter(p=>p.teamId!==9565),...placements];
 await updateEvidence({ placements: { ...existing, source,retrievedAt,teamId:9565,placements:merged } });
 console.log(`Saved ${placements.length} explicit placement rows (${placements.filter(r=>r.placing!=='-').length} ranked).`);
}finally{ws.close();}
