import {visibleInFrame,type Landmark} from './angles';
import {RepCounter} from './counter';
import type {Tracking} from './exercises';

export function createHipShift(config:Tracking){
  const counter=new RepCounter(config);
  let neutral:{at:number;x:number}[]=[],armed=false,origin=0,travel=0,last=-Infinity;
  return {
    update(metric:number|null,p:Landmark[],width:number,height:number,at:number,form=''){
      const hips=[23,24].every(i=>visibleInFrame(p[i]));
      const span=hips?Math.hypot((p[23].x-p[24].x)*width,(p[23].y-p[24].y)*height):0;
      const valid=metric!==null&&Number.isFinite(metric)&&Number.isFinite(span)&&span>1e-8&&width>0&&height>0;
      const x=valid?(p[23].x+p[24].x)*width/2:0;
      if(at-last>500){armed=false;neutral=[];counter.interrupt();}
      if(valid)last=at;
      if(!armed){
        if(valid&&metric!<=config.exitBelow!){
          neutral=neutral.filter(sample=>at-sample.at<=500);
          neutral.push({at,x});
          const positions=neutral.map(sample=>sample.x);
          if(at-neutral[0].at>=350&&(Math.max(...positions)-Math.min(...positions))/span<=.05){
            armed=true;origin=positions.reduce((a,b)=>a+b,0)/positions.length;travel=0;
          }
        }else if(valid)neutral=[];
      }
      const phase=counter.phase;
      if(armed&&valid){
        travel=Math.max(travel,Math.abs(x-origin)/span);
        if(metric!<config.exitBelow!&&phase!=='ready'&&travel<.15)counter.interrupt();
        counter.update(metric,at,form);
        if(phase!=='ready'&&counter.phase==='ready'){armed=false;neutral=[];}
      }else counter.update(null,at);
      return {metric:valid&&armed?metric:null,reps:counter.reps,phase:counter.phase,lastRep:counter.lastRep,
        feedback:!armed?'Return to center and stand still before shifting':counter.feedback};
    },
  };
}
