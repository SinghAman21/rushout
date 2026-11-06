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
 await assert.rejects(()=>client.join('tag_room',{roomCode:code,name:'Late'}));
 await new Promise(r=>setTimeout(r,3300));const runner=nextHost.state.players.get(nextHost.sessionId);const before={x:runner.x,y:runner.y};nextHost.send('input',{clientTick:1,mask:9,jump:true});await new Promise(r=>setTimeout(r,250));assert(runner.x>before.x,'authoritative movement');assert(runner.y<before.y,'authoritative jump');nextHost.send('input',{clientTick:2,mask:0});
 console.log('13-player capacity, full-room rejection, active-room rejection, readiness, countdown and host migration passed.');
}finally{await Promise.all(rooms.map(r=>r.leave()));}
