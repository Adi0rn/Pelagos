import test from 'node:test';
import assert from 'node:assert/strict';
import {drainage,erodeLandscape,surfaceCurrents,rowAreas} from '../surface-processes.js';
const w=12,h=6;
function landscape(){const e=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)e[y*w+x]=x<2||x>9?-100:1600-(x-2)*170+Math.abs(y-3)*35;return e;}
const rain=new Float32Array(w*h).fill(1800);
test('channels always drain downhill and cannot form cycles',()=>{
  const e=landscape(),d=drainage(e,rain,w,h);
  for(let i=0;i<e.length;i++)if(d.target[i]>=0){assert.ok(e[d.target[i]]<e[i]);let p=i,steps=0;while(d.target[p]>=0){p=d.target[p];assert.ok(++steps<=e.length);}}
});
test('erosion transfers sediment while conserving spherical volume',()=>{
  const e=landscape(),result=erodeLandscape(e,rain,{time:100,erosion:70},w,h),areas=rowAreas(w,h);
  let removed=0,deposited=0;for(let i=0;i<e.length;i++){removed+=result.erosion[i]*areas[Math.floor(i/w)];deposited+=result.sediment[i]*areas[Math.floor(i/w)];}
  assert.ok(removed>0);assert.ok(Math.abs(removed-deposited)/removed<1e-6);
  assert.ok(result.elevation.every(Number.isFinite));
  for(let i=0;i<e.length;i++)if(result.riverTarget[i]>=0)assert.ok(result.elevation[result.riverTarget[i]]<result.elevation[i]);
});
test('zero erosion strength or elapsed time preserves terrain',()=>{
  const e=landscape();for(const s of [{time:100,erosion:0},{time:0,erosion:100}])assert.deepEqual(erodeLandscape(e,rain,s,w,h).elevation,e);
});
test('rainfall changes runoff and carving intensity',()=>{
  const e=landscape(),dry=erodeLandscape(e,new Float32Array(e.length),{time:40,erosion:50},w,h),wet=erodeLandscape(e,rain,{time:40,erosion:50},w,h);
  assert.ok(dry.erosion.every(x=>x===0));assert.ok(wet.erosion.some(x=>x>0));
});
test('closed basins retain drainage and ocean currents avoid land',()=>{
  const e=new Float32Array(w*h).fill(1000);e[3*w+6]=20;
  const d=drainage(e,rain,w,h);assert.equal(d.target[3*w+6],-1);assert.ok(d.discharge[3*w+6]>d.discharge[0]);
  const sea=landscape(),flow=surfaceCurrents(sea,{circulation:65,day:24},w,h);
  for(let i=0;i<sea.length;i++)if(sea[i]>0){assert.equal(flow.currentEast[i],0);assert.equal(flow.currentNorth[i],0);}
  assert.ok(flow.currentEast.some(x=>x!==0));
  const still=surfaceCurrents(sea,{circulation:0,day:24},w,h);assert.ok(still.currentEast.every(x=>x===0)&&still.currentNorth.every(x=>x===0));
});
