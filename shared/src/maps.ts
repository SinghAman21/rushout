import type { GameMap, Obstacle } from "./types.js";

const FIELD_W = 1600;
const FIELD_H = 900;
const PLATFORM_H = 22;
const PLAYER_H = 32;

function platform(x: number, y: number, w: number): Obstacle {
  return { x, y, w, h: PLATFORM_H, type: "platform" };
}


function onPlatform(x: number, platformY: number) {
  return { x, y: platformY - PLAYER_H };
}

function abovePlatform(x: number, platformY: number) {
  return { x, y: platformY - 36 };
}

function sideWalls(width: number, height: number): Obstacle[] {
  return [
    { x: -24, y: 0, w: 24, h: height, type: "wall" },
    { x: width, y: 0, w: 24, h: height, type: "wall" },
  ];
}

// Every ascent is <= 125 units: below the 156-unit discrete jump apex.
// Open sides on each ledge allow solid-platform jumps without head collisions.
function arena(name: string, theme: GameMap['theme'], ledges: number[][], scenery: GameMap['scenery']): GameMap {
 const floors=ledges.map(([x,y,w])=>platform(x,y,w));
 const spawnLedges=[0,2,4,6,1,3,5,7,8,9,10,11,12];
 return {name,theme,width:FIELD_W,height:FIELD_H,
 obstacles:[...sideWalls(FIELD_W,FIELD_H),platform(0,880,1600),...floors],
 spawnPoints:spawnLedges.map((idx,i)=>{const p=floors[idx%floors.length];return onPlatform(p.x+Math.min(p.w-48,40+(i%2)*64),p.y);}),
 powerUpSpawns:floors.filter((_,i)=>i%2===0).map(p=>abovePlatform(p.x+p.w/2,p.y)),scenery};
}
export const SKYLINE_STAGE=arena('Skyline','skyline',[
 [40,760,260],[450,760,280],[880,760,270],[1320,760,240],
 [230,640,270],[680,640,240],[1120,640,280],
 [30,520,260],[460,520,270],[900,520,260],[1330,520,240],
 [240,400,270],[690,400,240],[1120,400,280],
 [460,280,270],[900,280,260]
],[{type:'tree',x:120,y:760,scale:0.65},{type:'bush',x:1500,y:760,scale:0.7},{type:'bush',x:760,y:400,scale:0.6}]);
export const COMPACT_STAGE=arena('Neon Rooftops','neon_rooftops',[
 [0,760,210],[350,760,230],[720,760,200],[1060,760,230],[1430,760,170],
 [160,640,200],[530,640,210],[900,640,200],[1270,640,210],
 [0,520,210],[350,520,230],[720,520,200],[1060,520,230],[1430,520,170],
 [160,400,200],[530,400,210],[900,400,200],[1270,400,210],
 [350,280,230],[720,280,200],[1060,280,230]
],[{type:'billboard',x:430,y:520,scale:0.8},{type:'antenna',x:1490,y:520,scale:0.7},{type:'sign',x:790,y:280,scale:0.8}]);
export const OPEN_STAGE=arena('Desert Ruins','desert_ruins',[
 [0,760,330],[490,760,240],[890,760,240],[1290,760,310],
 [250,640,280],[730,640,240],[1170,640,260],
 [40,520,280],[520,520,250],[970,520,240],[1390,520,210],
 [270,400,280],[760,400,240],[1200,400,260],
 [510,280,260],[980,280,250]
],[{type:'obelisk',x:850,y:400,scale:1.2},{type:'cactus',x:90,y:760,scale:0.7},{type:'rock',x:1460,y:760,scale:0.8}]);
export const MAPS: Record<string,GameMap>={arena:SKYLINE_STAGE,small_arena:COMPACT_STAGE,open_field:OPEN_STAGE};
export const MAP_NAMES:Record<string,string>={arena:'Skyline',small_arena:'Neon Rooftops',open_field:'Desert Ruins'};
