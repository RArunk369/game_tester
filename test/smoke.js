const assert = require('assert');
const { spawn } = require('child_process');
const PORT = 3189;
const child = spawn(process.execPath, [require('path').join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const url = `ws://127.0.0.1:${PORT}/ws`;
const shutdown = () => { try { child.kill(); } catch {} };
process.on('exit', shutdown);
async function waitForServer() { for (let i=0;i<60;i++) { try { const r=await fetch(`http://127.0.0.1:${PORT}/health`); if(r.ok) return; } catch {} await new Promise(r=>setTimeout(r,100)); } throw new Error('Server did not start'); }
function client(name) {
  const ws = new WebSocket(url), events = [];
  ws.addEventListener('message', e => { try { events.push(JSON.parse(e.data)); } catch {} });
  const wait = async (event, pred = () => true, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const i = events.findIndex(x => x.event === event && pred(x.data));
      if (i >= 0) return events.splice(i,1)[0].data;
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error(`Timed out waiting for ${event} for ${name}; saw ${events.map(e=>e.event).join(',')}`);
  };
  const emit = (event,data={}) => ws.send(JSON.stringify({event,data}));
  return {ws,wait,emit,name};
}
(async()=>{
 await waitForServer();
 const a=client('Alpha'), b=client('Beta'), c=client('Gamma');
 await Promise.all([a,b,c].map(x => new Promise((resolve,reject)=>{ x.ws.addEventListener('open',resolve,{once:true}); x.ws.addEventListener('error',reject,{once:true}); setTimeout(()=>reject(new Error('websocket open timeout')),4000); })));
 a.emit('create-room',{name:'Alpha',playerId:'test-alpha'});
 const ai=await a.wait('identity');
 b.emit('join-room',{name:'Beta',code:ai.roomCode,playerId:'test-beta'}); await b.wait('identity');
 c.emit('join-room',{name:'Gamma',code:ai.roomCode,playerId:'test-gamma'}); await c.wait('identity');
 a.emit('start-game');
 const [ar,br,cr]=await Promise.all([a.wait('private-role'),b.wait('private-role'),c.wait('private-role')]);
 const imposter = ar.role==='imposter'?a:br.role==='imposter'?b:c;
 const regulars = [a,b,c].filter(x=>x!==imposter);
 await Promise.all([a.wait('state',s=>s.phase==='clue'),b.wait('state',s=>s.phase==='clue'),c.wait('state',s=>s.phase==='clue')]);
 for (const x of [a,b,c]) x.emit('submit-clue',{clue:x===imposter?'Maybe something':'Cheese'});
 await Promise.all([a.wait('state',s=>s.phase==='voting'),b.wait('state',s=>s.phase==='voting'),c.wait('state',s=>s.phase==='voting')]);
 const ids = {a:'test-alpha',b:'test-beta',c:'test-gamma'};
 const imposterId = ids[imposter===a?'a':imposter===b?'b':'c'];
 regulars.forEach(x=>x.emit('submit-vote',{targetId:imposterId}));
 imposter.emit('submit-vote',{targetId:regulars[0]===a?'test-alpha':regulars[0]===b?'test-beta':'test-gamma'});
 await Promise.all([a.wait('state',s=>s.phase==='guess'),b.wait('state',s=>s.phase==='guess'),c.wait('state',s=>s.phase==='guess')]);
 imposter.emit('imposter-guess',{guess:'NOTTHEWORD'});
 const result = await Promise.all([a.wait('state',s=>s.phase==='results'),b.wait('state',s=>s.phase==='results'),c.wait('state',s=>s.phase==='results')]);
 assert(result.every(s=>s.imposterId)); assert(result.every(s=>s.word));
 console.log('PASS: 3 clients joined one room; private roles assigned; clue phase advanced; votes caught imposter; result revealed word and roles.');
 console.log('Room:',ai.roomCode,'Roles:',[ar.role,br.role,cr.role].join(', '),'Scores:',result[0].players.map(p=>`${p.name}:${p.score}`).join(' '));
 [a,b,c].forEach(x=>x.ws.close()); shutdown(); process.exit(0);
})().catch(e=>{console.error(e);shutdown();process.exit(1)});