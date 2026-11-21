import {visibleInFrame,type Landmark} from './angles';
import type {Rep} from './counter';

type Side='left'|'right';
type Sample={value:number;at:number};
const amplitude=.25,hysteresis=.05,minHalfPeriod=800,settleMs=800;

class Traversals {
  reps=0;
  lastRep:Rep|null=null;
  private anchor:Sample|null=null;
  private anchorKind=0;
  private candidate:Sample|null=null;
  private low:Sample|null=null;
  private high:Sample|null=null;
  private direction=0;
  private validAt=-Infinity;
  private settled:Sample|null=null;
  private form='';

  private confirm(point:Sample,kind:number,enabled:boolean){
    if(this.anchor&&kind!==this.anchorKind){
      const span=Math.abs(point.value-this.anchor.value),durationMs=point.at-this.anchor.at;
      if(span<amplitude)return;
      if(enabled&&durationMs>=minHalfPeriod){
        this.reps++;
        this.lastRep={min:Math.min(point.value,this.anchor.value),max:Math.max(point.value,this.anchor.value),rom:span,durationMs,quality:this.form?'form-note':'good',feedback:this.form||'Good repetition'};
      }
    }else if(this.anchor&&kind*(point.value-this.anchor.value)<0)return;
    this.anchor=point;this.anchorKind=kind;this.form='';
  }

  update(value:number|null,at:number,enabled:boolean,form:string){
    if(value===null||!Number.isFinite(value))return;
    const point={value,at};
    if(at-this.validAt>500){this.anchor=this.candidate=this.low=this.high=this.settled=null;this.direction=0;this.form='';}
    this.validAt=at;
    if(form)this.form=form;
    if(!this.candidate){this.candidate=this.low=this.high=this.settled=point;return;}
    if(!this.settled||Math.abs(value-this.settled.value)>.01)this.settled=point;
    if(!this.direction){
      if(value<=this.low!.value)this.low=point;
      if(value>=this.high!.value)this.high=point;
      if(value-this.low!.value>=hysteresis){this.confirm(this.low!,-1,enabled);this.direction=1;this.candidate=point;}
      else if(this.high!.value-value>=hysteresis){this.confirm(this.high!,1,enabled);this.direction=-1;this.candidate=point;}
    }else{
      const direction=this.direction;
      if(direction*(value-this.candidate.value)>.005)this.candidate=point;
      if(direction*(this.candidate.value-value)>=hysteresis){
        this.confirm(this.candidate,direction,enabled);this.direction=-direction;this.candidate=point;this.settled=point;
      }else if(at-this.settled.at>=settleMs&&this.anchor&&Math.abs(this.candidate.value-this.anchor.value)>=amplitude){
        this.confirm(this.candidate,direction,enabled);this.direction=-direction;this.candidate=point;this.settled=point;
      }
    }
  }
}

export function pendulumPosition(p:Landmark[],width:number,height:number,side:Side):number|null{
  const shoulder=side==='left'?11:12,wrist=side==='left'?15:16;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||![11,12,wrist].every(i=>visibleInFrame(p[i])))return null;
  const span=Math.hypot((p[11].x-p[12].x)*width,(p[11].y-p[12].y)*height);
  return span>1e-8?(p[wrist].x-p[shoulder].x)*width/span:null;
}

export function createPendulum(){
  const arms={left:new Traversals(),right:new Traversals()};
  const recent:{left:Sample[];right:Sample[]}={left:[],right:[]};
  let active:Side='left',time=-Infinity;
  let state={metric:null as number|null,reps:0,armReps:{left:0,right:0},activeArm:active as Side,phase:'ready' as 'ready'|'moving'|'returning',lastRep:null as Rep|null,feedback:'Swing gently from side to side'};
  return {
    update(p:Landmark[],width:number,height:number,at:number,form=''){
      if(!Number.isFinite(at)||at<=time)return state;
      if(at-time>500){recent.left=[];recent.right=[];}
      time=at;
      const values={left:pendulumPosition(p,width,height,'left'),right:pendulumPosition(p,width,height,'right')};
      const ranges={left:0,right:0};
      for(const side of ['left','right'] as const){
        recent[side]=recent[side].filter(sample=>at-sample.at<=4000);
        if(values[side]!==null)recent[side].push({value:values[side]!,at});
        const samples=recent[side].map(sample=>sample.value);
        if(samples.length)ranges[side]=Math.max(...samples)-Math.min(...samples);
      }
      const other:Side=active==='left'?'right':'left';
      if(values[active]===null&&values[other]!==null||values[other]!==null&&ranges[other]>ranges[active]*1.25+.05)active=other;
      for(const side of ['left','right'] as const)arms[side].update(values[side],at,side===active,form);
      const armReps={left:arms.left.reps,right:arms.right.reps},metric=values[active];
      state={metric,reps:armReps.left+armReps.right,armReps,activeArm:active,phase:metric===null?'ready':'moving',lastRep:arms[active].lastRep,feedback:metric===null?'Step into view so your shoulders and wrist are visible':form||arms[active].lastRep?.feedback||'Swing gently from side to side'};
      return state;
    },
  };
}
