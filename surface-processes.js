// Exploratory surface processes. Grid wraps east/west; polar edges are closed.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function neighbors(i,w,h){const x=i%w,y=Math.floor(i/w),out=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if((dx||dy)&&y+dy>=0&&y+dy<h)out.push((y+dy)*w+(x+dx+w)%w);}return out;}
export function rowAreas(w,h){return Float64Array.from({length:h},(_,y)=>6371**2*2*Math.PI/w*(Math.sin((.5-y/h)*Math.PI)-Math.sin((.5-(y+1)/h)*Math.PI)));}
export function drainage(elevation,rain,w,h){
  const n=w*h,target=new Int32Array(n);target.fill(-1);
  const discharge=new Float32Array(n),areas=rowAreas(w,h),order=[];
  for(let i=0;i<n;i++)if(elevation[i]>0){
    order.push(i);discharge[i]=rain[i]/1000*areas[Math.floor(i/w)]*1e6*.32/(365.25*86400);
    let bestSlope=0;const x=i%w,y=Math.floor(i/w);
    for(const j of neighbors(i,w,h)){
      const jy=Math.floor(j/w),jx=j%w,dx=Math.min(Math.abs(jx-x),w-Math.abs(jx-x));
      const distance=Math.hypot((Math.PI*6371/h)*(jy-y),(2*Math.PI*6371/w)*Math.max(.02,Math.cos((.5-(y+.5)/h)*Math.PI))*dx);
      const slope=(elevation[i]-elevation[j])/Math.max(1,distance);
      if(slope>bestSlope){bestSlope=slope;target[i]=j;}
    }
  }
  order.sort((a,b)=>elevation[b]-elevation[a]);
  for(const i of order)if(target[i]>=0)discharge[target[i]]+=discharge[i];
  return {target,discharge,order,areas};
}
export function erodeLandscape(elevation,rain,settings,w,h){
  const routed=drainage(elevation,rain,w,h),n=w*h,removed=new Float32Array(n),deposited=new Float32Array(n),sediment=new Float64Array(n),result=new Float32Array(elevation);
  const intensity=(settings.erosion??45)/100,age=1-Math.exp(-settings.time/90);
  for(const i of routed.order){
    const j=routed.target[i],area=routed.areas[Math.floor(i/w)];
    const slope=j<0?0:Math.max(0,elevation[i]-Math.max(0,elevation[j]));
    const cut=Math.min(elevation[i]*.35,750*age*intensity*Math.sqrt(routed.discharge[i]/150)*Math.min(1,slope/180));
    removed[i]=cut;let load=sediment[i]+cut*area;
    if(j>=0&&elevation[j]>0){
      const retained=load*(slope<30?.18:.035);deposited[i]+=retained/area;load-=retained;sediment[j]+=load;
    }else{
      // Closed basins retain sediment; river mouths spread it over a shelf fan.
      const center=j<0?i:j,sites=[];
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const y=Math.floor(center/w)+dy;if(y<0||y>=h)continue;
        const k=y*w+(center%w+dx+w)%w;
        if(j<0?k===i:elevation[k]<=0)sites.push(k);
      }
      if(!sites.length)sites.push(i);
      const sumArea=sites.reduce((sum,k)=>sum+routed.areas[Math.floor(k/w)],0);
      for(const k of sites)deposited[k]+=load/sumArea;
    }
  }
  for(let i=0;i<n;i++)result[i]=elevation[i]-removed[i]+deposited[i];
  const final=drainage(result,rain,w,h);
  let rivers=0,lakes=0;for(let i=0;i<n;i++)if(result[i]>0&&final.discharge[i]>80){if(final.target[i]>=0)rivers++;else lakes++;}
  return {elevation:result,erosion:removed,sediment:deposited,riverFlow:final.discharge,riverTarget:final.target,riverCells:rivers,basins:lakes};
}
export function surfaceCurrents(elevation,settings,w,h){
  const east=new Float32Array(w*h),north=new Float32Array(w*h),strength=(settings.circulation??65)/100;
  for(let i=0;i<w*h;i++)if(elevation[i]<=0){
    const x=i%w,y=Math.floor(i/w),lat=(.5-(y+.5)/h)*Math.PI,lon=(x/w-.5)*Math.PI*2;
    const winds=-Math.cos(lat*4),rotation=Math.sqrt(24/settings.day);
    let u=(winds*.65+Math.sin(lon*2+.8)*Math.cos(lat*3)*.4)*strength;
    let v=-Math.cos(lon*2+.8)*Math.sin(lat*3)*.35*strength*rotation;
    const land=k=>elevation[k]>0?1:0;
    const gx=land(y*w+(x+1)%w)-land(y*w+(x+w-1)%w),gy=land(Math.min(h-1,y+1)*w+x)-land(Math.max(0,y-1)*w+x),norm=gx*gx+gy*gy;
    if(norm){const incoming=Math.max(0,(u*gx-v*gy)/norm);u-=incoming*gx;v+=incoming*gy;}
    east[i]=clamp(u,-1.4,1.4);north[i]=clamp(v,-1.4,1.4);
  }
  return {currentEast:east,currentNorth:north};
}

