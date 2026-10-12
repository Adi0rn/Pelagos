// Deterministic spherical sandbox. Distances in km, velocity in cm/year, time in Myr.
import {erodeLandscape,surfaceCurrents} from './surface-processes.js';
export const W = 960, H = 480, RADIUS = 6371;
export const defaults = { seed:73142, plates:12, sea:350, fragmentation:75, speed:4, volcanic:60, age:4.5, temperature:16, atmosphere:1, tilt:23.5, day:24, erosion:45, circulation:65, time:0 };
export const presets = {
  archipelago:{...defaults},
  continental:{...defaults, sea:-450, fragmentation:18, volcanic:35, seed:23911},
  volcanic:{...defaults, sea:650, fragmentation:90, volcanic:100, age:1.2, temperature:24, seed:88241},
  frozen:{...defaults, sea:150, temperature:-18, atmosphere:.7, tilt:30, seed:49382}
};
export const ranges = {plates:[4,20],sea:[-1500,2000],fragmentation:[0,100],speed:[0,12],volcanic:[0,100],age:[.5,10],temperature:[-40,50],atmosphere:[.2,4],tilt:[0,60],day:[6,96],erosion:[0,100],circulation:[0,100],seed:[1,999999],time:[0,1000]};
export function validateSettings(input){
  if(!input || typeof input !== 'object') throw new Error('The file does not contain world settings.');
  const result={};
  for(const [key,[min,max]] of Object.entries(ranges)){
    const v=input[key]===undefined&&['erosion','circulation'].includes(key)?defaults[key]:input[key];
    if(typeof v!=='number' || !Number.isFinite(v) || v<min || v>max) throw new Error(`Invalid ${key}: expected a number from ${min} to ${max}.`);
    if(['seed','plates'].includes(key) && !Number.isInteger(v)) throw new Error(`${key} must be a whole number.`);
    result[key]=v;
  }
  return result;
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function normalized(v){const n=Math.hypot(...v)||1;return v.map(x=>x/n);}
function rotate(v,axis,angle){const c=Math.cos(angle),s=Math.sin(angle),d=dot(v,axis),x=cross(axis,v);return v.map((k,i)=>k*c+x[i]*s+axis[i]*d*(1-c));}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function hash(x,y,z,seed){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967295;}
function noise(x,y,z,seed){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let fx=x-ix,fy=y-iy,fz=z-iz;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);let sum=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)sum+=hash(ix+a,iy+b,iz+c,seed)*(a?fx:1-fx)*(b?fy:1-fy)*(c?fz:1-fz);return sum;}
function fbm(v,f,seed){return noise(v[0]*f+19,v[1]*f+7,v[2]*f+13,seed)*.56+noise(v[0]*f*2+19,v[1]*f*2+7,v[2]*f*2+13,seed+1)*.29+noise(v[0]*f*4+19,v[1]*f*4+7,v[2]*f*4+13,seed+2)*.15;}
export const names=['Thalassa','Nereid','Aster','Boreal','Coral','Zephyr','Pelagic','Aurora','Tethys','Nautilus','Vesper','Orion','Cygnus','Solace','Nival','Maris','Lyra','Eos','Atlas','Drift'];
export const formationNames=['Plate interior','Fold mountain range','Volcanic island arc','Subduction trench','Mid-ocean ridge','Rift valley','Transform fault'];
// Relief is a heuristic response to accumulated closure, not instantaneous speed.
// Mechanical mountain building remains active when volcanic activity is zero.
export function formationRelief({convergence,distance,time,continental,neighborContinental,overriding,activity,roughness=.5}){
  if(time<=0||Math.abs(convergence)<.65)return {relief:0,type:0};
  const closure=Math.abs(convergence)*10*time;
  const growth=1-Math.exp(-closure/650);
  const folds=.72+.28*Math.cos(distance/35+roughness*12);
  if(convergence>0){
    if(continental&&neighborContinental){
      const relief=6200*growth*Math.exp(-((distance/230)**2))*folds;
      return {relief,type:relief>100?1:0};
    }
    if(!overriding){
      const relief=-4600*growth*Math.exp(-((distance/80)**2));
      return {relief,type:relief< -100?3:0};
    }
    const belt=Math.exp(-(((distance-150)/105)**2));
    const relief=growth*belt*(continental?4600:6800)*(.35+.65*activity)*folds;
    return {relief,type:relief>100?(continental?1:2):0};
  }
  if(continental){
    const valley=-2400*growth*Math.exp(-((distance/95)**2));
    const shoulders=1000*growth*Math.exp(-(((distance-150)/80)**2));
    return {relief:valley+shoulders,type:Math.abs(valley+shoulders)>100?5:0};
  }
  const relief=2400*growth*Math.exp(-((distance/140)**2))*(1+.2*roughness);
  return {relief,type:relief>100?4:0};
}
const points=new Float32Array(W*H*3),weights=new Float32Array(H);
for(let y=0;y<H;y++){const lat=(.5-(y+.5)/H)*Math.PI;weights[y]=Math.cos(lat);for(let x=0;x<W;x++){const lon=((x+.5)/W-.5)*Math.PI*2,i=(y*W+x)*3;points[i]=Math.cos(lat)*Math.sin(lon);points[i+1]=Math.sin(lat);points[i+2]=Math.cos(lat)*Math.cos(lon);}}
export function makePlates(settings){const rng=random(settings.seed),out=[];for(let i=0;i<settings.plates;i++){const y=1-2*(i+.5)/settings.plates,theta=i*2.3999632297+rng()*.5;out.push({id:i,name:names[i],site:[Math.sqrt(1-y*y)*Math.sin(theta),y,Math.sqrt(1-y*y)*Math.cos(theta)],pole:normalized([rng()*2-1,rng()*2-1,rng()*2-1]),rate:(.55+rng()*.9)*(rng()>.5?1:-1),offset:rng()*10});}return out;}
export function simulate(s){
  const plates=makePlates(s),motion=plates.map(p=>({ ...p,angle:p.rate*s.speed*10/RADIUS*s.time,site:rotate(p.site,p.pole,p.rate*s.speed*10/RADIUS*s.time)}));
  motion.forEach(p=>p.continental=p.offset/10>(.2+s.fragmentation/100*.7));
  const history=s.time>0?[{time:s.time*.5,weight:.22},{time:s.time*.75,weight:.28},{time:s.time,weight:.5}].map(epoch=>({...epoch,plates:motion.map(p=>({...p,site:rotate(plates[p.id].site,p.pole,p.rate*s.speed*10/RADIUS*epoch.time)}))})):[];
  const N=W*H,ids=new Uint8Array(N),elevation=new Float32Array(N),temperature=new Float32Array(N),rain=new Float32Array(N),season=new Float32Array(N),crust=new Float32Array(N),boundary=new Uint8Array(N),stress=new Float32Array(N),relief=new Float32Array(N),formations=new Uint8Array(N);
  let landArea=0,total=0,tempSum=0,iceArea=0,rainSum=0,active=0;
  for(let i=0;i<N;i++){
    const y=Math.floor(i/W),p=[points[i*3],points[i*3+1],points[i*3+2]];let best=-2,next=-2,pid=0,nid=0;
    for(let j=0;j<motion.length;j++){const d=dot(p,motion[j].site);if(d>best){next=best;nid=pid;best=d;pid=j;}else if(d>next){next=d;nid=j;}}
    const plate=motion[pid],neighbor=motion[nid];ids[i]=pid;
    const edge=Math.exp(-(best-next)*48),v1=cross(plate.pole,p).map(v=>v*plate.rate*s.speed),v2=cross(neighbor.pole,p).map(v=>v*neighbor.rate*s.speed);
    const toward=normalized(neighbor.site.map((v,k)=>v-plate.site[k])),convergence=dot(v1.map((v,k)=>v-v2[k]),toward);
    stress[i]=convergence;boundary[i]=edge>.62?(convergence>.65?1:convergence<-.65?2:3):0;
    const local=rotate(p,plate.pole,-plate.angle),fragment=s.fragmentation/100;
    const broad=fbm(local,2.1,s.seed),fine=fbm(local,10+fragment*6,s.seed+311),detail=fbm(local,38,s.seed+777);
    const terrain=(broad-.5)*(1-fragment)*12500+(fine-.51)*fragment*10800+(detail-.5)*650-400;
    const activity=s.volcanic/100*Math.pow(4.5/(s.age+s.time/1000),.6);
    let deformation=0,dominant=0;
    // Carry earlier collision belts with their plate, leaving mountain and arc
    // remnants behind as the active boundary moves. Sampling is deterministic.
    for(const epoch of history){
      const hp=rotate(local,plate.pole,plate.rate*s.speed*10/RADIUS*epoch.time),own=epoch.plates[pid];
      let competitor=-2,other=null;
      for(const candidate of epoch.plates)if(candidate.id!==pid){const score=dot(hp,candidate.site);if(score>competitor){competitor=score;other=candidate;}}
      const ownScore=dot(hp,own.site);if(ownScore<competitor)continue;
      const delta=other.site.map((v,k)=>v-own.site[k]),normal=normalized(delta);
      const distance=Math.asin(clamp((ownScore-competitor)/Math.hypot(...delta),0,1))*RADIUS;
      if(distance>700)continue;
      const a=cross(own.pole,hp).map(v=>v*own.rate*s.speed),b=cross(other.pole,hp).map(v=>v*other.rate*s.speed),strain=dot(a.map((v,k)=>v-b[k]),normal);
      const effect=formationRelief({convergence:strain,distance,time:epoch.time,continental:own.continental,neighborContinental:other.continental,overriding:own.continental||(!other.continental&&pid<other.id),activity,roughness:detail});
      const amount=effect.relief*epoch.weight;deformation+=amount;
      if(Math.abs(amount)>dominant){dominant=Math.abs(amount);formations[i]=effect.type;}
    }
    relief[i]=deformation;
    if(dominant<70)formations[i]=0;
    if(boundary[i]===3&&formations[i]===0&&s.speed>0)formations[i]=6;
    const cooling=Math.min(s.time,200)*1.7*(1-edge)*(.5+fine);
    const e=terrain+deformation-cooling-s.sea;elevation[i]=e;
    const lat=Math.asin(p[1]),ocean=e<=0;
    const base=s.temperature+8*Math.log(s.atmosphere);
    const t=base+27*(Math.cos(lat)**2-2/3)-(ocean?0:Math.max(0,e)*.0065)+((fine-.5)*3);
    temperature[i]=t;
    season[i]=(s.tilt/23.5)*Math.abs(Math.sin(lat))*(ocean?7:20)/(Math.sqrt(s.atmosphere));
    const wetBelt=.45+.65*Math.exp(-Math.pow(lat/.3,2))+.38*Math.exp(-Math.pow((Math.abs(lat)-.9)/.28,2));
    const subtropic=1-.55*Math.exp(-Math.pow((Math.abs(lat)-.48)/.16,2));
    const r=clamp(1400*wetBelt*subtropic*(ocean?1.25:1.05)*Math.exp((t-15)*.025)*Math.pow(s.atmosphere,.3)*Math.pow(s.day/24,.12)*(1+(detail-.5)*.5)*Math.exp(-Math.max(0,e-700)/6000),0,9000);
    rain[i]=r;crust[i]=clamp((1-edge)*(20+s.time*.7+fine*140),0,300);
    const weight=weights[y];total+=weight;if(!ocean)landArea+=weight;if(t< -2 || (!ocean&&t<0))iceArea+=weight;tempSum+=t*weight;rainSum+=r*weight;if(boundary[i])active++;
  }
  // An ocean flood-fill estimates distance inland. Small islands consequently
  // have milder seasons and more available moisture than continental interiors.
  const hydrology=erodeLandscape(elevation,rain,s,W,H);
  for(let i=0;i<N;i++){
    const old=elevation[i],updated=hydrology.elevation[i];
    temperature[i]-=(Math.max(0,updated)-Math.max(0,old))*.0065;
    rain[i]*=Math.exp((Math.max(0,old-700)-Math.max(0,updated-700))/6000)*(updated<=0?1.25:1.05)/(old<=0?1.25:1.05);
    elevation[i]=updated;
    const lat=(.5-(Math.floor(i/W)+.5)/H)*Math.PI;
    season[i]=(s.tilt/23.5)*Math.abs(Math.sin(lat))*(updated<=0?7:20)/Math.sqrt(s.atmosphere);
  }
  const currents=surfaceCurrents(elevation,s,W,H);
  const coast=coastDistances(elevation);
  landArea=0;tempSum=0;iceArea=0;
  rainSum=0;
  for(let i=0;i<N;i++){
    if(elevation[i]>0){
      const inland=clamp(coast[i]/(12*H/120),0,1);
      season[i]*=(7+13*inland)/20;
      rain[i]*=1.12-.52*inland;
    }
    rainSum+=rain[i]*weights[Math.floor(i/W)];
    const weight=weights[Math.floor(i/W)];if(elevation[i]>0)landArea+=weight;tempSum+=temperature[i]*weight;if(temperature[i]< -2||(elevation[i]>0&&temperature[i]<0))iceArea+=weight;
  }
  const connected=landComponents(elevation);
  let highest=-Infinity,deepest=Infinity,upliftArea=0,erodedMax=0;const peaks=new Map();
  for(let i=0;i<N;i++){
    highest=Math.max(highest,elevation[i]);deepest=Math.min(deepest,elevation[i]);if(relief[i]>300)upliftArea+=weights[Math.floor(i/W)];
    erodedMax=Math.max(erodedMax,hydrology.erosion[i]);
    const type=formations[i],score=Math.abs(relief[i]),key=ids[i]*10+type;
    if(type>0&&type<6&&score>900&&(!peaks.has(key)||score>peaks.get(key).score))peaks.set(key,{cell:i,type,score,elevation:elevation[i]});
  }
  const features=[...peaks.values()].sort((a,b)=>b.score-a.score).map(f=>({...f,lon:((f.cell%W+.5)/W-.5)*360,lat:(.5-(Math.floor(f.cell/W)+.5)/H)*180}));
  return {plates:motion,ids,elevation,temperature,rain,season,crust,boundary,stress,coast,relief,formations,features,erosion:hydrology.erosion,sediment:hydrology.sediment,riverFlow:hydrology.riverFlow,riverTarget:hydrology.riverTarget,...currents,stats:{ocean:100*(1-landArea/total),temperature:tempSum/total,ice:iceArea/total*100,rain:rainSum/total,islands:connected.count,largest:landArea?connected.largest/landArea*100:0,land:landArea/total*100,active,highest,deepest,uplift:upliftArea/total*100,rivers:hydrology.riverCells,basins:hydrology.basins,erodedMax}};
}
function coastDistances(e){const distance=new Uint16Array(e.length);distance.fill(65535);const queue=new Int32Array(e.length);let start=0,end=0;for(let i=0;i<e.length;i++)if(e[i]<=0){distance[i]=0;queue[end++]=i;}while(start<end){const i=queue[start++],x=i%W,y=Math.floor(i/W),neighbors=[y*W+(x+1)%W,y*W+(x+W-1)%W];if(y>0)neighbors.push(i-W);if(y<H-1)neighbors.push(i+W);for(const j of neighbors)if(distance[j]===65535){distance[j]=distance[i]+1;queue[end++]=j;}}return distance;}
function landComponents(e){const seen=new Uint8Array(e.length),queue=new Int32Array(e.length);let count=0,largest=0;for(let i=0;i<e.length;i++){if(seen[i]||e[i]<=0)continue;count++;let start=0,end=1,area=0;queue[0]=i;seen[i]=1;while(start<end){const j=queue[start++],x=j%W,y=Math.floor(j/W);area+=weights[y];const neighbors=[y*W+(x+1)%W,y*W+(x+W-1)%W];if(y>0)neighbors.push(j-W);if(y<H-1)neighbors.push(j+W);for(const k of neighbors)if(!seen[k]&&e[k]>0){seen[k]=1;queue[end++]=k;}}largest=Math.max(largest,area);}return{count,largest};}
export function cellAt(lon,lat){const x=((Math.floor((lon+180)/360*W)%W)+W)%W,y=clamp(Math.floor((90-lat)/180*H),0,H-1);return y*W+x;}

