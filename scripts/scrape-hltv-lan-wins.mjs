import { updateEvidence } from './zywoo-dataset.mjs';
const source='https://www.hltv.org/player/11893/zywoo#tab-achievementBox';
const tabs=await(await fetch('http://127.0.0.1:9222/json/list')).json();
const tab=tabs.find(t=>t.url.startsWith('https://www.hltv.org/player/11893/zywoo'));
if(!tab)throw Error(`Open ${source} in remote-debugging Brave.`);
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
try{
 const response=await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('CDP timeout')),15000);ws.onmessage=e=>{clearTimeout(timer);r(JSON.parse(e.data));};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression:`JSON.stringify({reportedWins:Number([...document.querySelectorAll('#lanAchievement .highlighted-stat')].find(e=>e.querySelector('.description')?.textContent.trim()==='LANs won')?.querySelector('.stat')?.textContent),rows:[...document.querySelectorAll('#lanAchievement tbody tr')].map(r=>{const event=r.querySelector('.tournament-name-cell a');const team=r.querySelector('.team-name-cell a');return {tournamentId:Number(event.href.split('/events/')[1].split('/')[0]),tournamentName:event.textContent.trim(),eventUrl:event.href,teamId:Number(team.href.split('/team/')[1].split('/')[0]),team:team.textContent.trim(),placing:r.querySelector('.placement-cell').textContent.trim(),observedText:r.textContent.trim()};})})`}}));});
 if(response.result?.exceptionDetails)throw Error('Extraction failed');
 const observed=JSON.parse(response.result.result.value);const wins=observed.rows.filter(r=>r.placing==='1st');
 if(wins.length!==observed.reportedWins)throw Error(`List count ${wins.length} does not match reported ${observed.reportedWins}`);
 const retrievedAt=new Date().toISOString();
 for(const row of wins){row.evidence={sourceUrl:source,retrievedAt,selector:'#lanAchievement tbody tr',observedText:row.observedText,method:'Explicit first-place row in HLTV player LAN achievements; joined by event ID'};delete row.observedText;}
 await updateEvidence({ lanWins: {source,retrievedAt,playerId:11893,reportedWins:observed.reportedWins,criteria:'First-place rows explicitly listed in HLTV player LAN achievements (#lanAchievement); not all first-place tournaments.',wins} });
 console.log(`Saved ${wins.length} HLTV LAN wins.`);
}finally{ws.close();}
