import { readDataset, updateEvidence } from './zywoo-dataset.mjs';
const source='https://www.hltv.org/player/11893/zywoo';
const tabs=await(await fetch('http://127.0.0.1:9222/json/list')).json();
const tab=tabs.find(t=>t.url===source);if(!tab)throw Error(`Open ${source} in remote-debugging Brave.`);
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
try{
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout')),15000);ws.onmessage=e=>{clearTimeout(timer);resolve(JSON.parse(e.data));};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`JSON.stringify({text:document.querySelector('.mvp-count')?.parentElement.getAttribute('title'),count:Number(document.querySelector('.mvp-count')?.textContent)})`,returnByValue:true}}));});
 if(result.result?.exceptionDetails)throw Error('Extraction failed');
 const observed=JSON.parse(result.result.result.value);
 if(!observed.text?.startsWith('MVP winner at:'))throw Error('MVP list not found');
 const names=observed.text.split('\n').slice(1).map(s=>s.trim()).filter(Boolean);
 if(names.length!==observed.count)throw Error('MVP count and list disagree');
 const tournaments=(await readDataset()).evidence.tournaments;
 const byName=new Map();for(const m of tournaments.maps){const name=m.tournament.name;if(!byName.has(name))byName.set(name,new Set());byName.get(name).add(m.tournament.id);}
 const retrievedAt=new Date().toISOString();
 const awards=names.map(name=>{const ids=[...(byName.get(name)||[])];if(ids.length>1)throw Error(`Ambiguous event name: ${name}`);return {tournamentId:ids[0]??null,tournamentName:name,award:'MVP',playerId:11893,player:'ZywOo',evidence:{sourceUrl:source,retrievedAt,selector:'.mvp-count parent title',observedText:observed.text,method:'Explicit HLTV MVP winner list; exact tournament-name match to map-history event ID'}};});
 await updateEvidence({ mvps: {source,retrievedAt,playerId:11893,expectedAwards:observed.count,awards} });
 console.log(`${awards.length} MVP awards; ${awards.filter(a=>a.tournamentId!==null).length} joined to event IDs.`);
}finally{ws.close();}
