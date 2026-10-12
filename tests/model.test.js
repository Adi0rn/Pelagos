import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,defaults,presets,W,H,cellAt,validateSettings,formationRelief} from '../model.js';
test('same seed and time reproduce the same world',()=>{
  const a=simulate(defaults),b=simulate(defaults);
  assert.deepEqual(a.elevation,b.elevation);assert.deepEqual(a.stats,b.stats);
  assert.equal(a.elevation.length,W*H);
  assert.ok(a.stats.ocean>60 && a.stats.ocean<90);
  assert.ok(a.stats.largest<25);
});
test('continental preset makes a dominant landmass',()=>{
  const a=simulate(presets.continental);assert.ok(a.stats.largest>60);assert.ok(a.stats.land>40);
});
test('raising sea level cannot create more exposed land',()=>{
  const a=simulate(defaults),b=simulate({...defaults,sea:defaults.sea+500});
  assert.ok(b.stats.ocean>a.stats.ocean);
  for(let i=0;i<W*H;i++)assert.ok(Math.abs((a.elevation[i]-b.elevation[i])-500)<.002);
});
test('plates move through time and their IDs remain valid',()=>{
  const a=simulate(defaults),b=simulate({...defaults,time:100});
  assert.notDeepEqual(a.ids,b.ids);assert.notDeepEqual(a.elevation,b.elevation);
  assert.ok(b.ids.every(x=>x<defaults.plates));
});
test('zero plate speed fixes plate positions',()=>{
  const a=simulate({...defaults,speed:0}),b=simulate({...defaults,speed:0,time:100});
  assert.deepEqual(a.ids,b.ids);assert.ok(a.boundary.every(x=>x===0||x===3));
});
test('warmer worlds have less ice; tilt affects seasonal range',()=>{
  const cold=simulate({...defaults,temperature:-20}),hot=simulate({...defaults,temperature:30});
  assert.ok(cold.stats.ice>hot.stats.ice);assert.ok(hot.stats.temperature>cold.stats.temperature);
  const noTilt=simulate({...defaults,tilt:0});assert.ok(noTilt.season.every(x=>x===0));
});
test('island worlds have milder land seasons than continental worlds',()=>{
  function latitudeAdjustedSeason(w){let sum=0,count=0;for(let i=0;i<W*H;i++){
    const lat=(.5-(Math.floor(i/W)+.5)/H)*Math.PI;
    if(w.elevation[i]>0&&Math.abs(lat)>.1){sum+=w.season[i]/Math.abs(Math.sin(lat));count++;}
  }return sum/count;}
  assert.ok(latitudeAdjustedSeason(simulate(defaults))<latitudeAdjustedSeason(simulate(presets.continental)));
});
test('extreme supported settings remain finite and bounded',()=>{
  for(const s of [{...defaults,plates:4,temperature:-40,sea:2000,atmosphere:.2,time:1000},{...defaults,plates:20,temperature:50,sea:-1500,atmosphere:4,volcanic:100,age:.5,time:1000}]){
    const w=simulate(s);for(const key of ['elevation','temperature','rain','season','crust'])assert.ok(w[key].every(Number.isFinite),key);
    assert.ok(w.stats.ocean>=0&&w.stats.ocean<=100);assert.ok(w.stats.largest>=0&&w.stats.largest<=100.0001);
  }
});
test('map wraps longitude and clamps polar coordinates',()=>{
  assert.equal(cellAt(-180,0),cellAt(180,0));assert.equal(cellAt(540,0),cellAt(-180,0));
  assert.ok(cellAt(0,90)>=0);assert.ok(cellAt(0,-90)<W*H);
});
test('imports validate every setting and reject unsafe values',()=>{
  assert.deepEqual(validateSettings(defaults),defaults);
  for(const s of [{...defaults,plates:2},{...defaults,seed:1.1},{...defaults,time:Infinity},{...defaults,temperature:'20'},{}])assert.throws(()=>validateSettings(s));
  const legacy={...defaults};delete legacy.erosion;delete legacy.circulation;assert.deepEqual(validateSettings(legacy),defaults);
  assert.throws(()=>validateSettings({...defaults,erosion:null}));
});
test('continental collisions grow mechanical mountains without volcanism',()=>{
  const collision={convergence:4,distance:30,time:25,continental:true,neighborContinental:true,overriding:true,activity:0};
  const young=formationRelief({...collision,time:2}),mature=formationRelief(collision);
  assert.equal(mature.type,1);assert.ok(mature.relief>young.relief);assert.ok(mature.relief>2000);
  assert.equal(formationRelief({...collision,time:0}).relief,0);
});
test('ocean collisions form a trench on one side and an arc inland',()=>{
  const collision={convergence:5,distance:150,time:30,continental:false,neighborContinental:false,overriding:true,activity:1};
  const arc=formationRelief(collision),trench=formationRelief({...collision,overriding:false,distance:15});
  assert.equal(arc.type,2);assert.ok(arc.relief>3000);assert.equal(trench.type,3);assert.ok(trench.relief< -3000);
});
test('divergence creates ocean ridges and continental rifts',()=>{
  const divergent={convergence:-4,distance:10,time:30,continental:false,neighborContinental:false,overriding:true,activity:1};
  const ridge=formationRelief(divergent),rift=formationRelief({...divergent,continental:true});
  assert.equal(ridge.type,4);assert.ok(ridge.relief>1000);assert.equal(rift.type,5);assert.ok(rift.relief< -1000);
  assert.equal(formationRelief({...divergent,convergence:0}).relief,0);
});
test('evolving world exposes formation and uplift fields',()=>{
  const initial=simulate(defaults),evolved=simulate({...defaults,time:25});
  assert.ok(initial.relief.every(x=>x===0));assert.ok(evolved.relief.some(x=>x>1500));assert.ok(evolved.relief.some(x=>x< -1000));
  assert.ok(evolved.features.length>0);assert.ok(evolved.stats.uplift>0);
  assert.ok(evolved.formations.some(x=>x===2||x===1));
});
