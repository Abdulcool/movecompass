import type {Angles,Confidence} from './angles';
export function createRowMetric(){
  const arms={left:{extended:null as number|null,last:null as {angle:number;at:number}|null,quiet:[] as {angle:number;at:number}[]},right:{extended:null as number|null,last:null as {angle:number;at:number}|null,quiet:[] as {angle:number;at:number}[]}};
  return (angles:Angles,confidence:Confidence,at:number,still:boolean)=>{
    for(const side of ['left','right'] as const){
      const angle=angles[`${side}Elbow`],arm=arms[side];if(angle===null)continue;
      if(arm.extended===null)arm.extended=angle;
      if(still&&arm.last&&at>arm.last.at&&Math.abs(angle-arm.last.angle)*1000/(at-arm.last.at)<=15){
        arm.quiet=arm.quiet.filter(sample=>at-sample.at<=1200);arm.quiet.push({angle,at});
        if(arm.quiet.length>=3)arm.extended=Math.max(arm.extended,...arm.quiet.map(sample=>sample.angle));
      }else arm.quiet=[];
      arm.last={angle,at};
    }
    const left=angles.leftElbow,right=angles.rightElbow;
    const side=left===null?'right':right===null?'left':confidence.rightElbow>confidence.leftElbow?'right':'left';
    const angle=angles[`${side}Elbow`],extended=arms[side].extended;
    return angle===null||extended===null?null:Math.max(0,extended-angle);
  };
}
