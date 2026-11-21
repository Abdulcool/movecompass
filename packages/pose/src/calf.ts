import {visibleInFrame,type Landmark} from './angles';
export type Leg='left'|'right';
const joints={left:[25,27,29,31],right:[26,28,30,32]} as const;
export function visibleLeg(p:Landmark[],previous:Leg|null=null):Leg|null{
  const score=(side:Leg)=>{
    const [knee,ankle,,toe]=joints[side],ids=[knee,ankle,toe];
    return ids.every(i=>visibleInFrame(p[i]))?Math.min(...ids.map(i=>Math.min(p[i].visibility??1,p[i].presence??1))):0;
  };
  const left=score('left'),right=score('right');
  if(!left&&!right)return null;
  if(previous&&score(previous)>0&&Math.abs(left-right)<.15)return previous;
  return right>left?'right':'left';
}
export function calfLift(p:Landmark[],width:number,height:number,side:Leg|null=visibleLeg(p)){
  if(!side||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  const [knee,ankle,heel,toe]=joints[side];
  if(![knee,ankle,toe].every(i=>visibleInFrame(p[i])))return null;
  const distance=(a:number,b:number)=>Math.hypot((p[a].x-p[b].x)*width,(p[a].y-p[b].y)*height),shin=distance(knee,ankle);
  if(!Number.isFinite(shin)||shin<=1e-8)return null;
  const foot=visibleInFrame(p[heel])&&distance(heel,ankle)<shin*.6?heel:ankle;
  return (p[toe].y-p[foot].y)*height/shin;
}
