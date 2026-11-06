import assert from 'node:assert/strict';
import {MAPS,ALL_POWER_UP_TYPES,PLAYER_MOVE_SPEED} from 'rushout-shared';
import {createLocalGame,updateLocalGame,activatePowerUp} from '../client/src/game/engine.js';
const zero={up:false,down:false,left:false,right:false};
for(const [key,map] of Object.entries(MAPS)){
 const platforms=map.obstacles.filter(p=>p.type==='platform');
 const graph=platforms.map(()=>new Set<number>());
 for(let i=0;i<platforms.length;i++){
  const from=platforms[i];
  for(let x=from.x;x<=from.x+from.w-32;x+=12)for(const dir of [-1,0,1]){
   const g=createLocalGame(map,['probe'],999);g.running=true;const p=g.players[0];p.x=x;p.y=from.y-32;
   for(let f=0;f<100;f++){
    const beforeY=p.y;updateLocalGame(g,[{...zero,up:f===0,left:dir<0,right:dir>0}],1000/60);
    if(p.vy===0&&f>1&&p.y>=beforeY){const j=platforms.findIndex(o=>Math.abs(p.y+32-o.y)<.1&&p.x+32>o.x&&p.x<o.x+o.w);if(j>=0){graph[i].add(j);break;}}
   }
  }
 }
 const seen=new Set<number>([0]);const queue=[0];while(queue.length){const i=queue.shift()!;for(const j of graph[i])if(!seen.has(j)){seen.add(j);queue.push(j);}}
 const missing=platforms.map((p,i)=>({p,i})).filter(({i})=>!seen.has(i));
 console.log(key,`reachable ${seen.size}/${platforms.length}`,missing.map(({p})=>[p.x,p.y]));
 assert.equal(missing.length,0,`${key}: unreachable platforms`);
 for(const spawn of map.spawnPoints){assert(!map.obstacles.some(o=>spawn.x<o.x+o.w&&spawn.x+32>o.x&&spawn.y<o.y+o.h&&spawn.y+32>o.y),'spawn collision');}
}
for(const type of ALL_POWER_UP_TYPES){const g=createLocalGame(MAPS.arena,['A','B'],60);g.running=true;g.players[0].x=500;g.players[0].y=728;g.players[1].x=580;g.players[1].y=728;activatePowerUp(g,g.players[0],type);if(['speed_surge','ghost_step','safe_bubble'].includes(type))assert.equal(g.players[0].activePowerUp?.type,type);if(type==='freeze_pulse')assert.equal(g.players[1].activePowerUp?.type,type);if(type==='blink_dash')assert.equal(g.players[0].x,700);if(type==='mirror_decoy')assert.equal(g.decoys.length,1);if(type==='sticky_patch')assert.equal(g.stickyPatches.length,1);}
const g=createLocalGame(MAPS.arena,['A','B'],60);g.running=true;g.players[1].x=g.players[0].x+28;updateLocalGame(g,[zero,zero],1000/60);assert(g.players[1].isIt,'tag transfers');
const shield=createLocalGame(MAPS.arena,['A','B'],60);shield.running=true;shield.players[1].x=shield.players[0].x+28;activatePowerUp(shield,shield.players[1],'safe_bubble');updateLocalGame(shield,[zero,zero],1000/60);assert(shield.players[0].isIt);assert(!shield.players[1].activePowerUp);assert(shield.events.some(e=>e.type==='shield_block'));
console.log('All abilities, tag transfer, shield block and arena reachability passed.');
const locked=createLocalGame(MAPS.arena,['A','B'],60);locked.running=true;locked.players[1].x=locked.players[0].x+28;activatePowerUp(locked,locked.players[1],'safe_bubble');for(let i=0;i<10;i++)updateLocalGame(locked,[zero,zero],1000/60);assert(locked.players[0].isIt,'shield protects until separation');
const exp=createLocalGame(MAPS.arena,['A','B'],60);exp.running=true;activatePowerUp(exp,exp.players[0],'speed_surge');for(let i=0;i<190;i++)updateLocalGame(exp,[zero,zero],1000/60);assert(!exp.players[0].activePowerUp,'speed expires');
const slow=createLocalGame(MAPS.arena,['A','B'],60);slow.running=true;slow.players[0].x=500;slow.players[0].y=848;slow.stickyPatches=[{id:'test',x:516,y:864,remainingMs:1000}];updateLocalGame(slow,[{...zero,right:true},zero],1000/60);assert(slow.players[0].vx<PLAYER_MOVE_SPEED,'sticky slows');
console.log('Expiration, sticky slowdown and shield separation protection passed.');
