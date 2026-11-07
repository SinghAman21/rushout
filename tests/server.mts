import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../client/package.json',import.meta.url));
const {Client}=require('colyseus.js');
const client=new Client('ws://localhost:2567');const code=Math.random().toString(36).slice(2,8).toUpperCase();
const rooms:any[]=[];
try {
 const host=await client.create('tag_room',{roomCode:code,hostKey:'capacity-check',name:'Host',config:{roundLength:30,mapName:'small_arena',powerUpsEnabled:true}});host.onMessage("*",()=>{});rooms.push(host);
 for(let i=0;i<12;i++){const r=await client.join('tag_room',{roomCode:code,name:`Runner${i}`});r.onMessage("*",()=>{});rooms.push(r);}
 await assert.rejects(()=>client.join('tag_room',{roomCode:code,name:'Overflow'}));
 await new Promise(r=>setTimeout(r,200));assert.equal(host.state.players.size,13);
 const nextHost=rooms[1];await host.leave();rooms.shift();await new Promise(r=>setTimeout(r,200));assert.equal(nextHost.state.hostId,nextHost.sessionId);
 for(const room of rooms.slice(1))room.send('ready');await new Promise(r=>setTimeout(r,250));nextHost.send('startGame');await new Promise(r=>setTimeout(r,250));assert(nextHost.state.gameStarted);assert(nextHost.state.roundTimeRemaining>30);
 await new Promise(r=>setTimeout(r,3300));const runner=nextHost.state.players.get(nextHost.sessionId);const before={x:runner.x,y:runner.y};nextHost.send('input',{clientTick:1,mask:9,jump:true});await new Promise(r=>setTimeout(r,250));assert(runner.x>before.x,'authoritative movement');assert(runner.y<before.y,'authoritative jump');nextHost.send('input',{clientTick:2,mask:0});
 const late=await client.join('tag_room',{roomCode:code,name:'Late'});late.onMessage('*',()=>{});rooms.push(late);await new Promise(r=>setTimeout(r,150));assert.equal(late.state.players.size,14-1,'active join is admitted while room remains under capacity');assert(late.state.players.get(late.sessionId)?.alive,'late joiner enters the active round');
 // Let the authoritative 30-second round finish, then verify server-run voting.
 await new Promise(r=>setTimeout(r,30_500));
 for(let i=0;i<40&&nextHost.state.gameStarted;i++)await new Promise(r=>setTimeout(r,200));
 assert(!nextHost.state.gameStarted,'round finishes before rematch vote');
 nextHost.send('rematchVote',{yes:true});late.send('rematchVote',{yes:true});rooms[2].send('rematchVote',{yes:false});
 await new Promise(r=>setTimeout(r,150));
 await new Promise(r=>setTimeout(r,150));assert.equal(nextHost.state.players.size,13,'voting remains room scoped');
 await new Promise(r=>setTimeout(r,10_000));
 assert(nextHost.state.gameStarted,'two yes votes automatically start rematch after 10 seconds');
 const statePlayers:any[]=[];nextHost.state.players.forEach((p:any)=>statePlayers.push(p));
 assert.equal(statePlayers.filter(p=>p.alive).length,2,'only yes voters enter rematch');
 console.log('13-player capacity, active joining, movement, host migration, 10-second rematch voting and yes-voter participation passed.');
}finally{await Promise.all(rooms.map(r=>r.leave()));}
