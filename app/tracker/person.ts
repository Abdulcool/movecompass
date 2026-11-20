import {visible,type Landmark} from '@movecompass/pose';
type Point={x:number;y:number};
function describe(points:Landmark[]){
  const valid=points.filter(visible);if(valid.length<3)return null;
  const anchors=[11,12,23,24].map(i=>points[i]).filter(visible),center=anchors.length>=2?anchors:valid;
  const x=center.reduce((s,p)=>s+p.x,0)/center.length,y=center.reduce((s,p)=>s+p.y,0)/center.length;
  const width=Math.max(...valid.map(p=>p.x))-Math.min(...valid.map(p=>p.x));
  const height=Math.max(...valid.map(p=>p.y))-Math.min(...valid.map(p=>p.y));
  return {x,y,area:width*height};
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function createPersonSelector(auto?:Point|'largest'){
  let center:Point|undefined,explicit=false;
  const candidates=(poses:Landmark[][])=>poses.flatMap((pose,index)=>{const p=describe(pose);return p?[{...p,index}]:[];});
  return {
    choose(poses:Landmark[][],point:Point){
      const nearest=candidates(poses).sort((a,b)=>distance(a,point)-distance(b,point))[0];
      if(!nearest)return false;center=nearest;explicit=true;return true;
    },
    update(poses:Landmark[][]){
      const people=candidates(poses);
      if(!people.length)return {index:null,needsSelection:false,people};
      if(auto&&!explicit){
        const chosen=auto==='largest'?people.sort((a,b)=>b.area/(1+4*distance(b,{x:.5,y:.5})**2)-a.area/(1+4*distance(a,{x:.5,y:.5})**2))[0]:people.sort((a,b)=>distance(a,auto)-distance(b,auto))[0];
        center=chosen;explicit=true;
      }
      if(people.length>1&&!explicit)return {index:null,needsSelection:true,people};
      const nearest=center?people.sort((a,b)=>distance(a,center!)-distance(b,center!))[0]:people[0];
      if(center&&distance(nearest,center)>.25)return {index:null,needsSelection:true,people};
      center=nearest;return {index:nearest.index,needsSelection:false,people};
    },
  };
}
