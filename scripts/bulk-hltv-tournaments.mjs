// Reuse the team-history page open in Brave; exact join by mapStatsId.
import { readDataset, updateEvidence } from './zywoo-dataset.mjs';
const tabs=await(await fetch('http://127.0.0.1:9222/json/list')).json();
const tab=tabs.find(t=>t.url.startsWith('https://www.hltv.org/stats/teams/matches/9565/'));
if(!tab)throw Error('Open https://www.hltv.org/stats/teams/matches/9565/vitality in remote-debugging Brave first.');
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
try {
 const response=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout')),15000);ws.onmessage=e=>{clearTimeout(timer);resolve(JSON.parse(e.data));};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression:`JSON.stringify([...document.querySelectorAll('tbody tr')].map(row=>{const map=row.querySelector('a[href*="/mapstatsid/"]');const event=row.querySelector('a[href*="?event="]');if(!map||!event)return null;return {mapStatsId:Number(map.href.split('/mapstatsid/')[1].split('/')[0]),tournament:{id:Number(new URL(event.href).searchParams.get('event')),name:event.textContent.trim(),statsUrl:event.href},mapUrl:map.href};}).filter(Boolean))`}}));});
 if(response.result?.exceptionDetails)throw Error('Page extraction failed');
 const rows=JSON.parse(response.result.result.value);
 if(!rows.length||rows.some(r=>!r.mapStatsId||!r.tournament.id||!r.tournament.name))throw Error('Invalid or empty evidence');
 const history=await readDataset();
 const ids=new Set(history.maps.map(m=>m.mapStatsId));
 const maps=rows.filter(r=>ids.has(r.mapStatsId));
 if(new Set(maps.map(m=>m.mapStatsId)).size!==maps.length)throw Error('Duplicate map IDs');
 const existing=history.evidence?.tournaments;
 const refreshed=new Set(maps.map(m=>m.mapStatsId));
 const merged=[...(existing?.maps||[]).filter(m=>!refreshed.has(m.mapStatsId)),...maps];
 await updateEvidence({ tournaments: { ...existing, source:tab.url,retrievedAt:new Date().toISOString(),method:'Exact mapStatsId join from team map-history rows',sourceRows:rows.length,maps:merged } });
 console.log(`${rows.length} rows; ${maps.length}/${history.maps.length} player maps joined; ${new Set(maps.map(m=>m.tournament.id)).size} tournaments.`);
}finally{ws.close();}
