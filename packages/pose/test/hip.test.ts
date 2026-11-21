import {describe,it,expect} from 'vitest';
import {createTracker,type Landmark} from '../src/index';
import {createHipShift} from '../src/hip';
import {getExercise} from '../src/exercises';

function points(shift=0,feet=0):Landmark[]{
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  p[11]={x:.4,y:.2,visibility:1};p[12]={x:.6,y:.2,visibility:1};
  p[23]={x:.4+shift*.2,y:.5,visibility:1};p[24]={x:.6+shift*.2,y:.5,visibility:1};
  p[27]={x:.4+feet*.2,y:.9,visibility:1};p[28]={x:.6+feet*.2,y:.9,visibility:1};
  return p;
}
function run(){
  const tracker=createTracker('hip-shift');let at=0;
  let result=tracker.update({landmarks:[],width:1000,height:1000,timestampMs:at});
  return {tracker,
    frames(p:Landmark[],n=15){for(let i=0;i<n;i++)result=tracker.update({landmarks:p,width:1000,height:1000,timestampMs:at+=100});return result;},
    get result(){return result;},
  };
}
describe('hip shift neutral and pelvis gating',()=>{
  it('does not rearm during a brief pass through center between excursions',()=>{
    const hip=createHipShift(getExercise('hip-shift').tracking);let result;
    const feed=(shift:number,start:number,end:number)=>{for(let at=start;at<=end;at+=100)result=hip.update(Math.abs(shift),points(shift),1000,1000,at);};
    feed(0,0,400);feed(.45,500,1500);feed(0,1600,1600);
    expect(result!.reps).toBe(1);
    feed(-.45,1700,2700);feed(0,2800,4000);expect(result!.reps).toBe(1);
    feed(.45,4100,5100);feed(0,5200,5200);expect(result!.reps).toBe(2);
  });
  it.each([1,-1])('counts a controlled shift in direction %s after a still center',direction=>{
    const t=run();t.frames(points());t.frames(points(direction*.45));t.frames(points());
    expect(t.result.reps).toBe(1);expect(t.result.lastRep?.durationMs).toBeGreaterThanOrEqual(800);
    expect(t.result.lastRep?.quality).toBe('good');
  });
  it('requires neutral before the first excursion and after each return',()=>{
    const t=run();t.frames(points(.45));t.frames(points());expect(t.result.reps).toBe(0);
    t.frames(points(-.45));t.frames(points());expect(t.result.reps).toBe(1);
    t.frames(points(.45));t.frames(points());expect(t.result.reps).toBe(2);
  });
  it('does not count hand gestures or moving feet under a stationary pelvis',()=>{
    const t=run();t.frames(points());const hands=points();hands[15].x=.1;hands[16].x=.9;
    t.frames(hands);t.frames(points());t.frames(points(0,.5));t.frames(points());
    expect(t.result.reps).toBe(0);
  });
  it('rejects rapid movement and an excursion interrupted by tracking loss',()=>{
    const t=run();t.frames(points());t.frames(points(.45),2);t.frames(points());expect(t.result.reps).toBe(0);
    t.frames(points(.45));t.frames([],8);t.frames(points());expect(t.result.reps).toBe(0);
  });
  it('handles empty or hidden hips and resets calibration and counts',()=>{
    const t=run();expect(t.frames([]).metric).toBeNull();const hidden=points();hidden[23].visibility=.1;
    expect(t.frames(hidden).metric).toBeNull();t.frames(points());t.frames(points(.45));t.frames(points());
    expect(t.result.reps).toBe(1);t.tracker.reset();
    expect(t.tracker.update({landmarks:points(),width:0,height:1000,timestampMs:0}).reps).toBe(0);
  });
});
