import {describe,it,expect} from 'vitest';
import {createPendulum,pendulumPosition} from '../src/pendulum';
import {createTracker,type Landmark} from '../src/index';

function points(left=0,right=0):Landmark[]{
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  p[11]={x:.4,y:.2,visibility:1};p[12]={x:.6,y:.2,visibility:1};
  p[15]={x:.4+left*.2,y:.6,visibility:1};p[16]={x:.6+right*.2,y:.6,visibility:1};
  return p;
}
function replay(side:'left'|'right',amplitude=.35,halfPeriod=1200){
  const tracker=createPendulum();let at=0;
  const frame=(value:number)=>tracker.update(points(side==='left'?value:0,side==='right'?value:0),1000,1000,at+=100);
  let result=frame(-amplitude);
  for(let i=0;i<12;i++)result=frame(-amplitude);
  for(let step=1;step<=3;step++)for(let ms=100;ms<=halfPeriod;ms+=100){
    const value=(step%2?1:-1)*-amplitude*Math.cos(Math.PI*ms/halfPeriod);
    result=frame(value);
  }
  for(let i=0;i<15;i++)result=frame(amplitude);
  return result;
}
describe('pendulum endpoint traversals',()=>{
  it.each(['left','right'] as const)('selects the moving %s arm and counts alternating traversals',side=>{
    const r=replay(side);expect(r.activeArm).toBe(side);expect(r.armReps[side]).toBe(3);
    expect(r.armReps[side==='left'?'right':'left']).toBe(0);expect(r.reps).toBe(3);
    expect(r.lastRep?.durationMs).toBeGreaterThanOrEqual(800);
  });
  it('rejects short spans and fast traversals even if the final endpoint is held',()=>{
    expect(replay('left',.1).reps).toBe(0);
    expect(replay('left',.35,200).reps).toBe(0);
  });
  it('does not invent more extrema while stopped or during sub-hysteresis jitter',()=>{
    const t=createPendulum();let r;
    for(let i=0;i<150;i++)r=t.update(points(.3+(i%2?.005:-.005)),1000,1000,i*100);
    expect(r!.reps).toBe(0);
  });
  it('handles invisible arms, malformed dimensions, tracking loss and reset',()=>{
    expect(pendulumPosition([],1000,1000,'left')).toBeNull();
    expect(pendulumPosition(points(),0,1000,'right')).toBeNull();
    const t=createTracker('pendulum');let r;
    for(let i=0;i<15;i++)r=t.update({landmarks:points(-.3),width:1000,height:1000,timestampMs:i*100});
    t.update({landmarks:[],width:1000,height:1000,timestampMs:2500});
    r=t.update({landmarks:points(.3),width:1000,height:1000,timestampMs:3000});
    expect(r.reps).toBe(0);t.reset();
    expect(t.update({landmarks:[],width:1000,height:1000,timestampMs:0}).armReps).toEqual({left:0,right:0});
  });
  it('uses a visible right wrist without warning about the hidden left wrist',()=>{
    const p=points();p[15].visibility=.1;
    const r=createTracker('pendulum').update({landmarks:p,width:1000,height:1000,timestampMs:0});
    expect(r.missing).toEqual([]);expect(r.metric).not.toBeNull();
  });
});
