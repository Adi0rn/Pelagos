import {W,H,defaults,presets,ranges,simulate,validateSettings,cellAt,formationNames} from './model.js';
const $=id=>document.getElementById(id);
const controlSpecs=[
  ['plates','Tectonic plates',1,'', '4 plates','20 plates','surface'],
  ['sea','Sea level',50,' m','−1,500 m','+2,000 m','surface'],
  ['fragmentation','Island fragmentation',1,'%', 'Continents','Scattered islands','surface'],
  ['speed','Plate speed',.5,' cm/yr','Still','12 cm/yr','surface'],
  ['volcanic','Volcanic activity',1,'%', 'Quiet','Intense','surface'],
  ['erosion','Erosion strength',1,'%', 'Preserve peaks','Weather & carve','surface'],
  ['age','Planet age',.1,' Gyr','Young · 0.5','Old · 10','surface'],
  ['temperature','Reference temperature',1,' °C','−40 °C','50 °C','climate'],
  ['atmosphere','Atmospheric pressure',.1,' bar','0.2 bar','4 bar','climate'],
  ['tilt','Axial tilt',.5,'°','0°','60°','climate'],
  ['day','Day length',1,' h','6 hours','96 hours','climate'],
  ['circulation','Ocean circulation',1,'%', 'Still water','Strong currents','climate']
];
let settings={...defaults},world,layer='terrain',projection='atlas',playing=false,selected=null,rotation=0,lastFrame=0,lastBuild=0,pending=false;
const canvas=$('planet'),ctx=canvas.getContext('2d'),texture=document.createElement('canvas');texture.width=W;texture.height=H;const tctx=texture.getContext('2d');
const sphereCanvas=document.createElement('canvas'),sphereContext=sphereCanvas.getContext('2d');
const baseFrame=document.createElement('canvas'),baseContext=baseFrame.getContext('2d');
let oceanParticles=[],lastOceanFrame=0;
let texturePixels,revision=0,computing=false,queuedWorld=null,workerFailed=false;
const worldWorker=new Worker(new URL('./world-worker.js',import.meta.url),{type:'module'});
worldWorker.onmessage=({data})=>{
  computing=false;
  if(data.revision===revision||playing){
    world=data.world;world.settings=data.settings;oceanParticles=[];
    paintTexture();render();updateStats();inspect();
    $('export').disabled=false;
  }
  if(queuedWorld)dispatchWorld();
  else $('canvas-wrap').classList.remove('updating');
};
worldWorker.onerror=()=>{
  // Preserve the app on browsers that cannot start module workers.
  workerFailed=true;computing=false;queuedWorld=null;worldWorker.terminate();
  world=simulate(settings);world.settings={...settings};
  paintTexture();render();updateStats();inspect();$('export').disabled=false;
  $('canvas-wrap').classList.remove('updating');
};
function dispatchWorld(){if(computing||!queuedWorld)return;computing=true;const next=queuedWorld;queuedWorld=null;worldWorker.postMessage(next);}
const colors=['#a7cfa1','#acbb82','#6cafab','#b6a3c8','#d0bb82','#82b7d2','#9dbac0','#b89689','#799c7d','#b2afcf','#7fbaa7','#ce9bb2','#9eb482','#d0aa91','#839bbf','#89c1a6','#adab7f','#bb9aaa','#c2c397','#80b7bd'];
controlSpecs.forEach(([key,label,step,unit,minLabel,maxLabel,section])=>{
  const el=document.createElement('div');el.className='control';el.innerHTML=`<div class="control-head"><label for="control-${key}">${label}</label><output id="output-${key}" for="control-${key}"></output></div><input id="control-${key}" type="range" min="${ranges[key][0]}" max="${ranges[key][1]}" step="${step}"><div class="control-extents"><span>${minLabel}</span><span>${maxLabel}</span></div>`;
  $(section+'-controls').append(el);
  $('control-'+key).addEventListener('input',e=>{settings[key]=Number(e.target.value);syncControls();scheduleBuild();});
});
function syncControls(){for(const [key,,,unit] of controlSpecs){$('control-'+key).value=settings[key];$('output-'+key).textContent=(key==='sea'&&settings[key]>0?'+':'')+settings[key]+unit;}$('seed').value=settings.seed;$('time').value=settings.time;$('time-value').textContent=settings.time.toFixed(1);}
function scheduleBuild(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;build();});}
function build(){syncControls();if(workerFailed){world=simulate(settings);world.settings={...settings};paintTexture();render();updateStats();inspect();return;}queuedWorld={settings:{...settings},revision:++revision};$('canvas-wrap').classList.add('updating');if(!world)$('export').disabled=true;dispatchWorld();lastBuild=performance.now();}
const colorCache=new Map();
const hex=h=>{if(!colorCache.has(h))colorCache.set(h,[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);return colorCache.get(h);};
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*Math.max(0,Math.min(1,t))));
function ramp(value,stops){for(let j=1;j<stops.length;j++)if(value<stops[j][0])return mix(hex(stops[j-1][1]),hex(stops[j][1]),(value-stops[j-1][0])/(stops[j][0]-stops[j-1][0]));return hex(stops.at(-1)[1]);}
const boundaryColors={1:[225,154,115],2:[144,211,204],3:[207,188,112]};
function paintTexture(){if(!world)return;const image=tctx.createImageData(W,H);for(let i=0;i<W*H;i++){
  const e=world.elevation[i],t=world.temperature[i];let color;
  if(layer==='plates')color=mix(hex(colors[world.ids[i]]),[15,32,36],e<0?.46:.1);
  else if(layer==='rivers')color=e>0?ramp(e,[[0,'#567e63'],[2000,'#83906e'],[6000,'#d4cfc0']]):ramp(e,[[-7000,'#081d2d'],[0,'#2e777e']]);
  else if(layer==='erosion')color=world.sediment[i]>2?ramp(world.sediment[i],[[0,'#213435'],[40,'#bbc997'],[250,'#f0d18b']]):ramp(world.erosion[i],[[0,'#16282d'],[30,'#6a9daf'],[200,'#c89070'],[600,'#e6cab1']]);
  else if(layer==='currents')color=e>0?ramp(e,[[0,'#748b65'],[2500,'#485747'],[6000,'#b5b5a0']]):ramp(t,[[-30,'#102c47'],[0,'#155369'],[18,'#206a78'],[40,'#345b61']]);
  else if(layer==='elevation')color=ramp(e,[[-7000,'#061728'],[-3500,'#17516c'],[-500,'#4ca1ac'],[0,'#c8d5b3'],[800,'#96ac60'],[2500,'#b6a277'],[4500,'#a1775c'],[6500,'#f5eee4']]);
  else if(layer==='relief')color=ramp(world.relief[i],[[-5000,'#5866b4'],[-1500,'#5badd0'],[-150,'#294354'],[0,'#18282b'],[150,'#465039'],[1500,'#e9b764'],[5000,'#f0e7c5']]);
  else if(layer==='temperature')color=ramp(t,[[-55,'#747eae'],[-15,'#7baec5'],[5,'#94cdb6'],[22,'#d4d897'],[38,'#e5a16a'],[65,'#b95050']]);
  else if(layer==='rain')color=ramp(world.rain[i],[[0,'#d2b988'],[500,'#8caa92'],[1300,'#408e9e'],[2500,'#286a9f'],[6000,'#a9a1d3']]);
  else if(layer==='age')color=ramp(world.crust[i],[[0,'#ead69d'],[70,'#92cbb1'],[160,'#5892a4'],[300,'#73699b']]);
  else if(t< -2 || (e>0&&t<0))color=e>0?[195,210,204]:[151,186,195];
  else color=e>0?ramp(e,[[0,'#d6d0a0'],[70,'#c1c58b'],[180,'#86a56e'],[600,'#50875d'],[1400,'#386b50'],[2500,'#90967c'],[5000,'#e0dcc7']]):ramp(e,[[-7000,'#061823'],[-2500,'#0b3045'],[-800,'#155567'],[-100,'#3e979c'],[0,'#7fbfba']]);
  if(layer==='terrain'||layer==='elevation'){
    const x=i%W,y=Math.floor(i/W),left=world.elevation[y*W+(x+W-1)%W],right=world.elevation[y*W+(x+1)%W],up=world.elevation[Math.max(0,y-1)*W+x],down=world.elevation[Math.min(H-1,y+1)*W+x];
    const slope=(right-left+down-up)*(H/120)*.00014;
    const shade=Math.max(.55,Math.min(1.32,1-slope*(e>0?1.35:.08)));
    color=color.map(v=>Math.min(255,v*shade));
  }
  // Trace the actual plate seam rather than painting a broad, blocky band.
  const seam=world.ids[i]!==world.ids[Math.floor(i/W)*W+(i%W+1)%W]||(i+W<W*H&&world.ids[i]!==world.ids[i+W]);
  if($('boundaries').checked&&seam){const type=world.stress[i]>.65?1:world.stress[i]<-.65?2:3;color=mix(color,boundaryColors[type],layer==='plates'?.95:.72);}
  const j=i*4;image.data[j]=color[0];image.data[j+1]=color[1];image.data[j+2]=color[2];image.data[j+3]=255;
}tctx.putImageData(image,0,0);
if(($('rivers').checked&&['terrain','elevation','rivers','currents'].includes(layer))||layer==='rivers'){
  tctx.lineCap='round';
  for(let i=0;i<W*H;i++)if(world.elevation[i]>0&&world.riverFlow[i]>(layer==='rivers'?80:200)&&world.riverTarget[i]>=0){
    const j=world.riverTarget[i],x=i%W+.5,y=Math.floor(i/W)+.5;let tx=j%W+.5,ty=Math.floor(j/W)+.5;
    if(tx-x>W/2)tx-=W;if(x-tx>W/2)tx+=W;
    tctx.strokeStyle=layer==='rivers'?'#98e4f1':'#79cddd';tctx.lineWidth=1.1+Math.min(2,Math.log2(world.riverFlow[i]/80)*.35);
    for(const offset of tx<0?[0,W]:tx>W?[0,-W]:[0]){tctx.beginPath();tctx.moveTo(x+offset,y);tctx.lineTo(tx+offset,ty);tctx.stroke();}
  }
}
texturePixels=tctx.getImageData(0,0,W,H).data;updateLegend();}
function updateLegend(){const entries=layer==='rivers'?[['#98e4f1','River channels'],['#567e63','Watersheds']]:layer==='erosion'?[['#6a9daf','Eroded'],['#e6cab1','Strong erosion'],['#f0d18b','Sediment deposited']]:layer==='currents'?[['#87dcea','Surface flow'],['#dfb279','Warm water'],['#90beda','Cold water']]:layer==='terrain'?[['#124653','Deep ocean'],['#508b84','Shallows'],['#799c75','Land'],['#d6d1b0','Highlands']]:layer==='elevation'?[['#17516c','−3,500 m'],['#c8d5b3','Sea level'],['#b6a277','2,500 m'],['#f5eee4','6,500 m']]:layer==='relief'?[['#5866b4','Subsidence'],['#18282b','Unchanged'],['#e9b764','Uplift'],['#f0e7c5','+5,000 m']]:layer==='plates'?[['#e19a73','Convergent'],['#90d3cc','Divergent'],['#cfbc70','Transform']]:layer==='temperature'?[['#7baec5','−15 °C'],['#94cdb6','5 °C'],['#d4d897','22 °C'],['#e5a16a','38 °C']]:layer==='rain'?[['#d2b988','Dry'],['#408e9e','1,300 mm/yr'],['#a9a1d3','6,000 mm/yr']]:[['#ead69d','New crust'],['#92cbb1','70 Myr'],['#73699b','300+ Myr']];$('legend').innerHTML=entries.map(([color,label])=>`<span><i style="background:${color}"></i>${label}</span>`).join('');$('map-title').textContent={terrain:'Surface atlas',rivers:'Rivers & drainage basins',erosion:'Erosion & sediment',currents:'Ocean surface circulation',elevation:'Elevation & ocean depth',relief:'Collision-driven terrain change',plates:'Tectonic plates',temperature:'Thermal patterns',rain:'Precipitation atlas',age:'Crust age estimate'}[layer];}
function geometry(){const width=canvas.clientWidth,height=canvas.clientHeight;if(projection==='atlas'){const w=width,h=Math.min(height-60,width/2);return{x:0,y:(height-h)/2,w,h};}const r=Math.min(width*.43,height*.43);return{x:width/2,y:height/2,r};}
function screenPoint(lon,lat,g){if(projection==='atlas')return[g.x+(lon+180)/360*g.w,g.y+(90-lat)/180*g.h,true];const l=(lon-rotation)*Math.PI/180,p=lat*Math.PI/180;return[g.x+g.r*Math.cos(p)*Math.sin(l),g.y-g.r*Math.sin(p),Math.cos(p)*Math.cos(l)>0];}
function render(){if(!world)return;const dpr=Math.min(devicePixelRatio||1,2),width=canvas.clientWidth,height=canvas.clientHeight;if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#091d25';ctx.fillRect(0,0,width,height);const g=geometry();document.querySelector('.map-scale').style.display=projection==='globe'?'none':'';if(projection==='atlas')document.querySelector('.map-scale').style.setProperty('--scale-width',`${g.w*5000/(2*Math.PI*6371)}px`);ctx.save();
  if(projection==='atlas'){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(texture,g.x,g.y,g.w,g.h);ctx.strokeStyle='#85b1a21b';ctx.lineWidth=.7;for(let lon=-150;lon<=150;lon+=30){let x=g.x+(lon+180)/360*g.w;ctx.beginPath();ctx.moveTo(x,g.y);ctx.lineTo(x,g.y+g.h);ctx.stroke();}for(let lat=-60;lat<=60;lat+=30){let y=g.y+(90-lat)/180*g.h;ctx.beginPath();ctx.moveTo(g.x,y);ctx.lineTo(g.x+g.w,y);ctx.stroke();ctx.fillStyle='#acc9c17a';ctx.font='8px monospace';ctx.fillText(lat===0?'EQ':Math.abs(lat)+'°'+(lat>0?'N':'S'),8,y-4);}ctx.strokeStyle='#86bbaa26';ctx.strokeRect(g.x,g.y,g.w,g.h);
  }else{
    const size=Math.ceil(g.r*2*dpr),radius=size/2,source=texturePixels,img=sphereContext.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const nx=(x+.5-radius)/radius,ny=-(y+.5-radius)/radius,d=nx*nx+ny*ny;if(d>1)continue;
      const z=Math.sqrt(1-d),lat=Math.asin(ny),lon=Math.atan2(nx,z)+rotation*Math.PI/180;
      const tx=(((lon/(2*Math.PI)+.5)*W-.5)%W+W)%W,ty=Math.max(0,Math.min(H-1,(.5-lat/Math.PI)*H-.5));
      const x0=Math.floor(tx),x1=(x0+1)%W,y0=Math.floor(ty),y1=Math.min(H-1,y0+1),fx=tx-x0,fy=ty-y0;
      const a=(y0*W+x0)*4,b=(y0*W+x1)*4,c=(y1*W+x0)*4,e=(y1*W+x1)*4,out=(y*size+x)*4;
      const light=Math.max(0,-.35*nx+.4*ny+.85*z),shade=layer==='terrain'?.32+.76*light:.72+.28*z;
      const rim=layer==='terrain'?Math.pow(1-z,4)*.32:0;
      for(let channel=0;channel<3;channel++){
        const top=source[a+channel]*(1-fx)+source[b+channel]*fx,bottom=source[c+channel]*(1-fx)+source[e+channel]*fx;
        img.data[out+channel]=(top*(1-fy)+bottom*fy)*shade*(1-rim)+[95,174,207][channel]*rim;
      }
      img.data[out+3]=Math.min(255,(1-d)*radius*255);
    }
    sphereCanvas.width=size;sphereCanvas.height=size;sphereContext.putImageData(img,0,0);
    const halo=ctx.createRadialGradient(g.x,g.y,g.r*.96,g.x,g.y,g.r*1.12);halo.addColorStop(0,'#64b8da00');halo.addColorStop(.32,'#64b8da22');halo.addColorStop(1,'#64b8da00');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(g.x,g.y,g.r*1.12,0,Math.PI*2);ctx.fill();
    ctx.imageSmoothingQuality='high';ctx.drawImage(sphereCanvas,g.x-g.r,g.y-g.r,g.r*2,g.r*2);ctx.strokeStyle='#95c5b74a';ctx.beginPath();ctx.arc(g.x,g.y,g.r,0,Math.PI*2);ctx.stroke();
  }
  if(layer==='plates'){for(const p of world.plates){const lat=Math.asin(p.site[1])*180/Math.PI,lon=Math.atan2(p.site[0],p.site[2])*180/Math.PI,[x,y,visible]=screenPoint(lon,lat,g);if(!visible)continue;const v=[p.pole[1]*p.site[2]-p.pole[2]*p.site[1],p.pole[2]*p.site[0]-p.pole[0]*p.site[2],p.pole[0]*p.site[1]-p.pole[1]*p.site[0]],sign=Math.sign(p.rate),east=(v[0]*Math.cos(lon*Math.PI/180)-v[2]*Math.sin(lon*Math.PI/180))*sign,north=v[1]*sign/Math.max(.2,Math.cos(lat*Math.PI/180)),a=Math.atan2(-north,east),len=settings.speed===0?0:12+Math.abs(p.rate)*5;ctx.strokeStyle='#d4e7c997';ctx.fillStyle='#d4e7c9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);ctx.stroke();if(len){ctx.beginPath();ctx.moveTo(x+Math.cos(a)*len,y+Math.sin(a)*len);ctx.lineTo(x+Math.cos(a)*len-Math.cos(a-.5)*5,y+Math.sin(a)*len-Math.sin(a-.5)*5);ctx.moveTo(x+Math.cos(a)*len,y+Math.sin(a)*len);ctx.lineTo(x+Math.cos(a)*len-Math.cos(a+.5)*5,y+Math.sin(a)*len-Math.sin(a+.5)*5);ctx.stroke();}if(layer==='plates'){ctx.font='9px monospace';ctx.textAlign='center';ctx.fillStyle='#142522';ctx.fillRect(x-30,y+8,60,16);ctx.fillStyle='#d5e2d1';ctx.fillText(p.name.toUpperCase(),x,y+19);ctx.textAlign='left';}}}
  if(['terrain','elevation','relief'].includes(layer)&&world.features){
    const placed=[],typesShown=new Set();
    for(const feature of world.features){
      const [x,y,visible]=screenPoint(feature.lon,feature.lat,g);
      if(!visible||typesShown.has(feature.type)||placed.some(p=>Math.hypot(p[0]-x,p[1]-y)<95))continue;
      if(projection==='globe'&&Math.hypot(x-g.x,y-g.y)>g.r*.88)continue;
      const label={1:'MOUNTAIN BELT',2:feature.elevation>0?'ISLAND ARC':'VOLCANIC ARC',3:'OCEAN TRENCH',4:'SPREADING RIDGE',5:'RIFT VALLEY'}[feature.type];
      ctx.font='8px monospace';const labelWidth=ctx.measureText(label).width+14;
      const lx=Math.max(6,Math.min(width-labelWidth-6,x+10)),ly=Math.max(45,Math.min(height-38,y-15));
      ctx.strokeStyle=[3,5].includes(feature.type)?'#adc9df':'#e9d3a7';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x+3,y-3);ctx.lineTo(lx,ly+9);ctx.stroke();
      ctx.fillStyle='#0b1b20dc';ctx.fillRect(lx,ly,labelWidth,18);ctx.fillStyle='#e5dfc7';ctx.fillText(label,lx+7,ly+12);
      placed.push([x,y]);typesShown.add(feature.type);if(placed.length>=4)break;
    }
  }
  if(selected){const [x,y,visible]=screenPoint(selected.lon,selected.lat,g);if(visible){ctx.strokeStyle='#ebf5d4';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y-5);ctx.moveTo(x,y+5);ctx.lineTo(x,y+12);ctx.stroke();}}
  ctx.restore();
  baseFrame.width=canvas.width;baseFrame.height=canvas.height;baseContext.drawImage(canvas,0,0);
}
function animateOcean(dt){
  if(!world||!baseFrame.width)return;
  const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2),g=geometry();
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.drawImage(baseFrame,0,0,width,height);ctx.save();
  ctx.beginPath();if(projection==='atlas')ctx.rect(g.x,g.y,g.w,g.h);else ctx.arc(g.x,g.y,g.r,0,Math.PI*2);ctx.clip();
  if(!oceanParticles.length)for(let k=0;k<330;k++)oceanParticles.push({lon:0,lat:0,age:100,trail:[]});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const particle of oceanParticles){
    if(particle.age>25){
      let attempts=0;
      do{particle.lon=Math.random()*360-180;particle.lat=Math.asin(Math.random()*2-1)*180/Math.PI;attempts++;}while(attempts<40&&world.elevation[cellAt(particle.lon,particle.lat)]>0);
      particle.age=Math.random()*10;particle.trail=[];
    }
    const i=cellAt(particle.lon,particle.lat);if(world.elevation[i]>0)continue;
    const u=world.currentEast[i],v=world.currentNorth[i],rate=Math.hypot(u,v);
    if(rate<.015||world.temperature[i]<-2)continue;
    const lon=((particle.lon+u*(reduced?0:dt)*4/Math.max(.35,Math.cos(particle.lat*Math.PI/180))+180)%360+360)%360-180;
    const lat=Math.max(-88,Math.min(88,particle.lat+v*(reduced?0:dt)*4));
    if(world.elevation[cellAt(lon,lat)]>0){particle.age=100;continue;}
    particle.lon=lon;particle.lat=lat;particle.age+=dt;particle.trail.push([lon,lat]);if(particle.trail.length>45)particle.trail.shift();
    const t=world.temperature[i];ctx.strokeStyle=t>24?'#e6b683ad':t<5?'#abcde8ad':'#8ee1dfad';ctx.lineWidth=1.1;ctx.beginPath();let previous=null;
    for(const point of particle.trail){const [x,y,visible]=screenPoint(...point,g);if(!visible){previous=null;continue;}if(previous&&Math.abs(x-previous[0])<width/2)ctx.lineTo(x,y);else ctx.moveTo(x,y);previous=[x,y];}
    ctx.stroke();const [x,y,visible]=screenPoint(lon,lat,g);if(!visible)continue;
    let direction=Math.atan2(-v,u);const tail=particle.trail.at(-2);
    if(tail&&!reduced){const [px,py,pv]=screenPoint(...tail,g);if(pv&&Math.abs(x-px)<width/2)direction=Math.atan2(y-py,x-px);}
    const length=reduced?9:4;
    ctx.beginPath();ctx.moveTo(x-Math.cos(direction)*length,y-Math.sin(direction)*length);ctx.lineTo(x,y);ctx.lineTo(x-Math.cos(direction-.6)*3,y-Math.sin(direction-.6)*3);ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(direction+.6)*3,y-Math.sin(direction+.6)*3);ctx.stroke();
  }
  ctx.restore();
}
function updateStats(){const s=world.stats;$('ocean-value').textContent=s.ocean.toFixed(1)+'%';$('ocean-bar').style.width=s.ocean+'%';$('islands-value').textContent=s.islands.toLocaleString();$('largest-value').textContent=s.islands?`Largest: ${s.largest.toFixed(1)}% of all land`:'No exposed land';$('temp-value').textContent=s.temperature.toFixed(1)+'°C';$('ice-value').textContent=s.ice.toFixed(1)+'% estimated ice cover';$('map-tag').textContent=settings.plates+(settings.speed?' ACTIVE PLATES':' STATIONARY PLATES');
  $('world-insight').textContent=s.land<.1?'An ocean from pole to pole. Lower sea level or increase volcanic activity to reveal land.':s.largest<35?`An archipelago of ${s.islands} landmasses, sharing one ocean-dominated world. Small coastlines open many routes between land and sea.`:`${s.islands} landmasses emerge from the ocean. The largest holds ${s.largest.toFixed(0)}% of the exposed land, giving this world a more continental character.`;
  $('ocean-insight').textContent=s.ocean>75?'Extensive oceans moderate seasonal temperature swings. Small islands tend toward maritime climates.':s.ocean>40?'Oceans buffer coastal temperatures; larger interiors have stronger seasonal variation.':'Broad land surfaces experience stronger seasonal extremes. Ocean influence is limited.';
  $('tectonic-insight').textContent=world.settings.speed===0?'Plates are stationary. Increase plate speed to build collision formations.':world.settings.time<1?'Play the timeline or advance 25 Myr to grow mountain belts, volcanic arcs, trenches, and rifts.':`${s.uplift.toFixed(1)}% of the surface has gained over 300 m from tectonics. Highest terrain: ${Math.round(s.highest).toLocaleString()} m. Explore Elevation or Uplift to see the formations.`;
  $('rain-insight').textContent=`Estimated mean precipitation: ${Math.round(s.rain).toLocaleString()} mm/year. ${settings.tilt<10?'Low axial tilt keeps seasons mild.':settings.tilt>35?'High axial tilt amplifies seasonal swings.':'Rain concentrates near the equator and temperate latitudes.'}`;
  $('water-insight').textContent=`Downhill runoff maps ${s.rivers.toLocaleString()} major channel segments and ${s.basins.toLocaleString()} closed drainage basins. Maximum erosion so far: ${Math.round(s.erodedMax)} m. Advance time to carve channels and build sediment fans.`;
}
function inspect(){if(!selected||!world)return;const i=cellAt(selected.lon,selected.lat),p=world.plates[world.ids[i]],e=world.elevation[i],b=world.boundary[i];$('inspect-prompt').hidden=true;$('inspect-data').hidden=false;$('location-title').textContent=`${Math.abs(selected.lat).toFixed(1)}°${selected.lat>=0?'N':'S'} · ${Math.abs(selected.lon).toFixed(1)}°${selected.lon>=0?'E':'W'}`;const rows=[['Surface',e>0?(world.temperature[i]<0?'Ice-covered land':'Exposed land'):(world.temperature[i]<-2?'Frozen ocean':'Open ocean')],['Plate',p.name],['Elevation',`${Math.round(e).toLocaleString()} m`],['Temperature',`${world.temperature[i].toFixed(1)} °C`],['Rainfall',`${Math.round(world.rain[i]).toLocaleString()} mm/yr`],['Seasonal range',`${world.season[i].toFixed(1)} °C`],['Local plate speed',localSpeed(p,selected).toFixed(1)+' cm/yr'],['Boundary',b?{1:'Convergent',2:'Divergent',3:'Transform'}[b]:'Plate interior'],['Crust age estimate',`${world.crust[i].toFixed(0)} Myr`]];
  rows.splice(2,0,['Formation',world.formations[i]===2&&e<=0?'Submerged volcanic arc':formationNames[world.formations[i]]],['Tectonic change',(world.relief[i]>0?'+':'')+Math.round(world.relief[i]).toLocaleString()+' m']);
  rows.push(['Erosion',Math.round(world.erosion[i]).toLocaleString()+' m removed'],['Sediment',Math.round(world.sediment[i]).toLocaleString()+' m deposited'],['Estimated runoff',e>0?world.riverFlow[i].toFixed(0)+' m³/s':'Ocean'],['Drainage',e<=0?'Ocean':world.riverTarget[i]<0?'Closed basin':'Downhill channel']);
  $('location-details').innerHTML=rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');}
function localSpeed(p,pos){const lat=pos.lat*Math.PI/180,lon=pos.lon*Math.PI/180,v=[Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon)],d=v.reduce((s,n,i)=>s+n*p.pole[i],0);return Math.sqrt(Math.max(0,1-d*d))*Math.abs(p.rate)*settings.speed;}
function position(event){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,g=geometry();if(projection==='atlas'){if(x<g.x||x>g.x+g.w||y<g.y||y>g.y+g.h)return null;return{lon:(x-g.x)/g.w*360-180,lat:90-(y-g.y)/g.h*180};}const nx=(x-g.x)/g.r,ny=-(y-g.y)/g.r,d=nx*nx+ny*ny;if(d>1)return null;let lon=Math.atan2(nx,Math.sqrt(1-d))*180/Math.PI+rotation;return{lon:((lon+180)%360+360)%360-180,lat:Math.asin(ny)*180/Math.PI};}
canvas.addEventListener('pointermove',e=>{const p=position(e);$('coordinates').textContent=p?`${Math.abs(p.lat).toFixed(1)}°${p.lat>=0?'N':'S'}  /  ${Math.abs(p.lon).toFixed(1)}°${p.lon>=0?'E':'W'}`:'SELECT A LOCATION TO INSPECT';});
canvas.addEventListener('click',e=>{const p=position(e);if(p){selected=p;inspect();render();}});
document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>{layer=button.dataset.layer;document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('active',b===button));paintTexture();render();}));
['atlas','globe'].forEach(view=>$(view).addEventListener('click',()=>{projection=view;$('canvas-wrap').classList.toggle('globe-view',view==='globe');$('atlas').classList.toggle('active',view==='atlas');$('globe').classList.toggle('active',view==='globe');$('globe-controls').hidden=view!=='globe';render();}));
$('rotate-left').addEventListener('click',()=>{rotation-=30;render();});$('rotate-right').addEventListener('click',()=>{rotation+=30;render();});
$('boundaries').addEventListener('change',()=>{paintTexture();render();});
$('rivers').addEventListener('change',()=>{paintTexture();render();});
$('currents').addEventListener('change',()=>{oceanParticles=[];render();});
function setPlaying(value){playing=value;$('play').textContent=value?'Ⅱ':'▶';$('play').setAttribute('aria-label',value?'Pause simulation':'Play simulation');$('run-status').textContent=value?'RUNNING · PLATES IN MOTION':settings.time>=1000?'COMPLETE · 1,000 MYR':'PAUSED · READY TO EXPLORE';lastFrame=performance.now();}
$('play').addEventListener('click',()=>{if(settings.time>=1000){settings.time=0;build();}setPlaying(!playing);if(!playing)build();});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName)&&!$('about-dialog').open){e.preventDefault();$('play').click();}});
$('time').addEventListener('input',e=>{setPlaying(false);settings.time=Number(e.target.value);scheduleBuild();});
const labels={archipelago:['The archipelago world','Scattered islands. One connected ocean.'],continental:['The continental world','Broad landmasses. Familiar horizons.'],volcanic:['The volcanic ocean','Young crust. Restless island arcs.'],frozen:['The frozen islands','Cold seas. Ice-covered shores.']};
function presetLabel(key){$('world-name').textContent=labels[key][0];$('preset-note').textContent=labels[key][1];}
function loadPreset(key){setPlaying(false);settings={...presets[key]};selected=null;$('inspect-prompt').hidden=false;$('inspect-data').hidden=true;presetLabel(key);build();}
$('preset').addEventListener('change',e=>loadPreset(e.target.value));$('reset').addEventListener('click',()=>loadPreset($('preset').value));
$('regenerate').addEventListener('click',()=>{settings.seed=Math.floor(Math.random()*999999)+1;settings.time=0;setPlaying(false);build();});
$('seed').addEventListener('change',e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=999999){settings.seed=n;settings.time=0;setPlaying(false);build();}else syncControls();});
$('sea-experiment').addEventListener('click',()=>{settings.sea=Math.min(2000,settings.sea+200);build();});
$('advance-geology').addEventListener('click',()=>{setPlaying(false);settings.time=Math.min(1000,settings.time+25);build();});
$('about').addEventListener('click',()=>$('about-dialog').showModal());$('close-about').addEventListener('click',()=>$('about-dialog').close());
$('about-dialog').addEventListener('click',e=>{if(e.target===$('about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('export').addEventListener('click',()=>{const snapshot={application:'Pelagos',version:1,preset:$('preset').value,settings:{...settings},statistics:{...world.stats},model:'Heuristic spherical tectonics and climate; not a forecast'};const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`pelagos-${settings.seed}-${settings.time.toFixed(1)}Myr.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
function restoreExperiment(data){if(!data||data.application!=='Pelagos'||data.version!==1)throw new Error('Please select a version 1 Pelagos export.');const imported=validateSettings(data.settings);setPlaying(false);settings=imported;const key=Object.hasOwn(presets,data.preset)?data.preset:'archipelago';$('preset').value=key;presetLabel(key);selected=null;$('inspect-prompt').hidden=false;$('inspect-data').hidden=true;build();$('import-status').textContent='Experiment restored successfully.';}
$('import').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('Please select a Pelagos export smaller than 1 MB.');restoreExperiment(JSON.parse(await file.text()));}catch(error){$('import-status').textContent=error.message;}finally{e.target.value='';}});
$('restore-text').addEventListener('click',()=>{try{restoreExperiment(JSON.parse($('import-text').value));}catch(error){$('import-status').textContent=error.message;}});
new ResizeObserver(()=>render()).observe($('canvas-wrap'));
function frame(now){if(playing){const delta=Math.min((now-lastFrame)/1000,.5);settings.time=Math.min(1000,settings.time+delta*Number($('speed').value));syncControls();if(now-lastBuild>220)build();if(settings.time>=1000){setPlaying(false);build();}}if((layer==='currents'||$('currents').checked)&&document.visibilityState!=='hidden'&&now-lastOceanFrame>33){animateOcean(Math.min(.1,(now-lastOceanFrame)/1000));lastOceanFrame=now;}lastFrame=now;requestAnimationFrame(frame);}
build();requestAnimationFrame(frame);



