import { describe, expect, it } from 'vitest';
import { angle2, angle3, createTracker, exercises, extractAngles, getExercise, OneEuroFilter, RepCounter, type Angles, type Landmark } from '../src/index';

const blankAngles = (): Angles => Object.fromEntries(['leftElbow', 'rightElbow', 'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle', 'trunkLean'].map(k => [k, null])) as Angles;
function points(): Landmark[] {
  const p = Array.from({length: 33}, () => ({x: 0.5, y: 0.5, z: 0, visibility: 1}));
  for (const [i, x, y] of [[11,.4,.2],[12,.6,.2],[23,.4,.5],[24,.6,.5],[25,.4,.7],[26,.6,.7],[27,.4,.9],[28,.6,.9],[31,.45,.95],[32,.65,.95]]) p[i] = {x,y,z:0,visibility:1};
  return p;
}
const sample = (p: Landmark[], time: number, worldLandmarks: Landmark[] = []) => ({landmarks: [p], worldLandmarks: [worldLandmarks], timestampMs: time, width: 1000, height: 1000});
function run(counter: RepCounter, values: number[], start = 0, form = '') {
  values.forEach((v, i) => counter.update(v, start + i * 100, form));
  return counter;
}

describe('angle math', () => {
  it('uses the more visible side for best-side knee and elbow metrics', () => {
    for (const [id, left, right] of [['sit-to-stand', 'leftKnee', 'rightKnee'], ['seated-row', 'leftElbow', 'rightElbow']] as const) {
      const angles = {...blankAngles(), [left]: 130, [right]: 75};
      const confidence = Object.fromEntries(Object.keys(angles).map(key => [key, key === right ? .9 : .6])) as ReturnType<typeof extractAngles>['confidence'];
      expect(getExercise(id).tracking.metric(angles, [], 1, 1, confidence)).toBe(75);
      confidence[left] = 1;
      expect(getExercise(id).tracking.metric(angles, [], 1, 1, confidence)).toBe(130);
      angles[left] = null;
      expect(getExercise(id).tracking.metric(angles, [], 1, 1, confidence)).toBe(75);
    }
  });
  it('computes known 3D angles and ignores translation and scale', () => {
    expect(angle3({x:1,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:1})).toBeCloseTo(90);
    expect(angle3({x:0,y:0},{x:1,y:0},{x:2,y:0})).toBeCloseTo(180);
    expect(angle3({x:4,y:2},{x:2,y:2},{x:2,y:4})).toBeCloseTo(90);
  });
  it('corrects image aspect and rejects degenerate inputs', () => {
    expect(angle2({x:1,y:.5},{x:.5,y:.5},{x:.75,y:1},200,100)).toBeCloseTo(45);
    expect(angle3({x:0,y:0},{x:0,y:0},{x:1,y:0})).toBeNull();
    expect(angle2({x:1,y:0},{x:0,y:0},{x:0,y:1},0,100)).toBeNull();
    expect(angle3({x:NaN,y:0},{x:0,y:0},{x:0,y:1})).toBeNull();
  });
});
describe('One Euro filter', () => {
  it('preserves constants, smooths jitter and follows sustained movement', () => {
    const f = new OneEuroFilter();
    expect(f.filter(1,0)).toBe(1);
    expect(f.filter(1,16)).toBe(1);
    expect(f.filter(2,32)).toBeGreaterThan(1);
    expect(f.filter(2,48)).toBeLessThan(2);
    for(let t=64;t<2000;t+=16) f.filter(2,t);
    expect(f.filter(2,2000)).toBeCloseTo(2,3);
  });
  it('handles timestamps, reset, adaptive beta and invalid values', () => {
    const f = new OneEuroFilter(), fast = new OneEuroFilter(1,10);
    f.filter(0,10); fast.filter(0,10);
    const v=f.filter(1,30);
    expect(fast.filter(1,30)).toBeGreaterThan(v);
    expect(f.filter(8,30)).toBe(v);
    expect(f.filter(8,20)).toBe(v);
    expect(() => f.filter(NaN,40)).toThrow();
    expect(() => new OneEuroFilter(0)).toThrow();
    f.reset(); expect(f.filter(5,0)).toBe(5);
  });
});
describe('joint extraction', () => {
  it('extracts all bilateral joints, world angles and angle confidence', () => {
    const p=points(), w=points();
    p[13]={x:.4,y:.3,z:0,visibility:.8}; p[15]={x:.5,y:.3,z:0,visibility:1};
    w[13]={x:.4,y:.3,z:0,visibility:1}; w[15]={x:.4,y:.4,z:0,visibility:1};
    expect(extractAngles(sample(p,0)).angles.leftElbow).toBeCloseTo(90);
    const result=extractAngles(sample(p,0,w));
    expect(result.angles.leftElbow).toBeCloseTo(180);
    expect(result.confidence.leftElbow).toBe(.8);
    expect(Object.keys(result.angles)).toHaveLength(11);
    expect(result.angles.trunkLean).toBeCloseTo(0);
  });
  it('gates all three landmarks including absent visibility and supports 2D fallback', () => {
    for(const i of [11,13,15]) {
      const p=points(); p[i].visibility=.49;
      expect(extractAngles(sample(p,0,points())).angles.leftElbow).toBeNull();
    }
    const p=points(); delete p[11].visibility;
    expect(extractAngles(sample(p,0)).confidence.leftElbow).toBe(0);
    expect(Object.values(extractAngles(sample([],0)).angles).every(v=>v===null)).toBe(true);
  });
});

const cycles: Record<string, number[]> = {
  'sit-to-stand': [170,170,140,120,100,90,100,120,140,150,165,170],
  'seated-row': [165,165,135,115,90,80,90,110,130,145,155,165],
  'wall-angels': [80,80,105,125,155,165,160,140,120,100,85,80],
  'hip-shift': [0,0,.18,.25,.38,.4,.39,.3,.25,.15,.05,0],
  'calf-raise': [0,0,.035,.05,.07,.09,.08,.07,.05,.03,.01,0],
  'pendulum': [-.3,-.3,-.2,-.1,0,.1,.2,.22,.23,.24,.3,.3],
};
describe.each(exercises)('$id repetitions', exercise => {
  it('counts an amplitude-qualified synthetic cycle with ROM', () => {
    const c=run(new RepCounter(exercise.tracking),cycles[exercise.id]);
    expect(c.reps).toBe(1);
    expect(c.lastRep?.quality).toBe('good');
    expect(c.lastRep!.rom).toBeGreaterThan(0);
    expect(c.lastRep!.durationMs).toBeGreaterThanOrEqual(800);
  });
  it('does not double count jitter at the target or count rapid cycles', () => {
    const v=cycles[exercise.id], target=v[5];
    const c=run(new RepCounter(exercise.tracking),[...v.slice(0,6), ...Array.from({length:20},(_,i)=>target+(i%2?.001:-.001)), ...v.slice(6)]);
    expect(c.reps).toBe(1);
    const fast=new RepCounter(exercise.tracking);
    v.forEach((value,i)=>fast.update(value,i*10));
    expect(fast.reps).toBe(0);
    expect(fast.lastRep?.quality).toBe('partial');
  });
  it('ignores null frames and discards an excursion interrupted by tracking loss', () => {
    const c=new RepCounter(exercise.tracking), v=cycles[exercise.id];
    v.slice(0,6).forEach((value,i)=>c.update(value,i*100));
    c.update(null,600); c.update(null,1100);
    v.slice(6).forEach((value,i)=>c.update(value,1200+i*100));
    expect(c.reps).toBe(0);
  });
  it('flags an incomplete excursion as partial rather than counting it', () => {
    const c=new RepCounter(exercise.tracking);
    const cfg=exercise.tracking;
    const home=cfg.enterBelow !== undefined ? cfg.exitAbove!+5 : cfg.exitBelow!-.01;
    const target=cfg.enterBelow ?? cfg.enterAbove!;
    const middle=home+(target-home)*.6;
    const values=exercise.id==='pendulum' ? [-.3,-.2,-.1,.1,.1,.1,.1,.1,-.1,-.2,-.3] : [home,middle,middle,middle,middle,middle,middle,middle,middle,middle,home];
    run(c,values);
    expect(c.reps).toBe(0);
    expect(c.lastRep?.quality).toBe('partial');
  });
});
it('rejects partial range but counts complete repetitions with form notes', () => {
  const c=run(new RepCounter(getExercise('seated-row').tracking),[170,140,120,120,120,120,120,120,120,140,170]);
  expect(c.lastRep?.quality).toBe('partial'); expect(c.reps).toBe(0);
  const bad=run(new RepCounter(getExercise('sit-to-stand').tracking),cycles['sit-to-stand'],0,'Keep chest up');
  expect(bad.reps).toBe(1); expect(bad.lastRep?.quality).toBe('form-note'); expect(bad.lastRep?.feedback).toBe('Keep chest up');
});
it('counts a 25 degree asymmetric arm raise with a directional form note', () => {
  const cfg = getExercise('wall-angels').tracking, counter = new RepCounter(cfg);
  [80, 95, 115, 140, 165, 170, 165, 150, 125, 100, 80].forEach((right, i) => {
    const a = {...blankAngles(), leftShoulder: right - 25, rightShoulder: right, leftElbow: 100, rightElbow: 100};
    counter.update(cfg.metric(a, [], 1, 1), i * 100, cfg.formChecks.find(check => check.test(a))?.message);
  });
  expect(counter.reps).toBe(1);
  expect(counter.lastRep?.quality).toBe('form-note');
  expect(counter.lastRep?.feedback).toBe('Left arm lower than right — try to lift evenly');
});
it('retains partial-ROM and tracking-loss rejection even when form notes are present', () => {
  const cfg = getExercise('wall-angels').tracking;
  const partial = run(new RepCounter(cfg), [70, 95, 110, 120, 120, 120, 110, 100, 85, 75, 70], 0, 'Open your elbows');
  expect(partial.reps).toBe(0); expect(partial.lastRep?.quality).toBe('partial');
  const lost = new RepCounter(cfg);
  run(lost, [70, 110, 160], 0, 'Open your elbows');
  lost.update(null, 900);
  lost.update(70, 1100, 'Open your elbows');
  expect(lost.reps).toBe(0);
});
it('ignores duplicate and out-of-order timestamps', () => {
  const c=run(new RepCounter(getExercise('seated-row').tracking), cycles['seated-row']);
  c.update(80,0); c.update(170,1100);
  expect(c.reps).toBe(1);
});

describe('exercise metrics and copy', () => {
  it('provides full copy, thresholds, and safe empty-frame metrics for all six', () => {
    expect(exercises).toHaveLength(6);
    for(const e of exercises) {
      expect(e.steps).toHaveLength(3); expect(e.safety.length).toBeGreaterThan(20);
      expect(e.tracking.metric(blankAngles(),[],1000,1000)).toBeNull();
    }
    expect(()=>getExercise('missing')).toThrow('Unknown exercise');
  });
  it('uses a visible arm, averages even arms and notes symmetry without requiring it', () => {
    const a=blankAngles(); a.leftShoulder=160;
    expect(getExercise('wall-angels').tracking.metric(a,[],1,1)).toBe(160);
    a.rightShoulder=130;
    expect(getExercise('wall-angels').tracking.metric(a,[],1,1)).toBe(160);
    expect(getExercise('wall-angels').tracking.formChecks.some(check => check.test(a))).toBe(true);
    a.rightShoulder=150;
    expect(getExercise('wall-angels').tracking.metric(a,[],1,1)).toBe(155);
    a.rightKnee=170;
    expect(getExercise('sit-to-stand').tracking.metric(a,[],1,1)).toBe(170);
  });
  it('normalizes positional metrics and gates required landmarks', () => {
    const p=points(), a=blankAngles(); p[15].x=.46;
    expect(getExercise('pendulum').tracking.metric(a,p,1000,1000)).toBeCloseTo(.3);
    p[23].x+=.08; p[24].x+=.08;
    expect(getExercise('hip-shift').tracking.metric(a,p,1000,1000)).toBeCloseTo(.4);
    p[27].visibility=.1;
    p[28].visibility=.1;
    expect(getExercise('calf-raise').tracking.metric(a,p,1000,1000)).toBeNull();
  });
});

describe('tracker integration', () => {
  it.each(exercises.filter(e=>e.id!=='calf-raise'))('tracks $id through landmark frames', e => {
    const tracker=createTracker(e.id);
    const metricValues=cycles[e.id]; let result;
    metricValues.forEach((value,i)=> {
      for(let j=0;j<8;j++) {
        const p=points(), world=points();
        const setAngle=(ids:number[],degrees:number)=>{
          const [a,b,c]=ids; world[b]={x:0,y:0,z:0,visibility:1}; world[a]={x:0,y:1,z:0,visibility:1};
          world[c]={x:Math.sin(degrees*Math.PI/180),y:Math.cos(degrees*Math.PI/180),z:0,visibility:1};
        };
        if(e.id==='sit-to-stand') setAngle([23,25,27],value);
        if(e.id==='seated-row') setAngle([11,13,15],value);
        if(e.id==='wall-angels') { setAngle([23,11,13],value); setAngle([24,12,14],value); world[15]={...world[13],x:world[13].x+1}; world[16]={...world[14],x:world[14].x+1}; }
        if(e.id==='pendulum') { p[15].x=p[11].x+value*.2; p[11].x=.1; p[12].x=.3; p[15].x=.1+value*.2; }
        if(e.id==='hip-shift') { p[23].x+=value*.2; p[24].x+=value*.2; }
        result=tracker.update(sample(p,(i*8+j)*100,world));
      }
    });
    expect(result!.reps).toBe(1);
    expect(result!.lastRep?.quality).toBe('good');
    tracker.reset(); expect(tracker.update(sample([],0)).reps).toBe(0);
  });
  it('calibrates calf baseline and counts a raise and return', () => {
    const tracker=createTracker('calf-raise'); let result;
    for(let i=0;i<12;i++) result=tracker.update(sample(points(),i*100));
    expect(result!.metric).toBeCloseTo(0);
    for(let i=12;i<44;i++) {
      const p=points(); const raise=i<28?.03:0;
      p[27].y-=raise; p[28].y-=raise;
      result=tracker.update(sample(p,i*100));
    }
    expect(result!.reps).toBe(1);
  });
  it('waits for a still calf calibration window after initial movement',()=>{
    const tracker=createTracker('calf-raise');let r;
    for(let i=0;i<16;i++) {
      const p=points();p[27].y-=i%2?.08:0;p[28].y-=i%2?.08:0;
      r=tracker.update(sample(p,i*100));expect(r.metric).toBeNull();
    }
    for(let i=16;i<40;i++)r=tracker.update(sample(points(),i*100));
    expect(r!.metric).not.toBeNull();
    for(let i=40;i<72;i++) {
      const p=points();p[27].y-=i<56?.03:0;p[28].y-=i<56?.03:0;r=tracker.update(sample(p,i*100));
    }
    expect(r!.reps).toBe(1);
  });
  it('does not invent angles or reps for invisible frames or invalid geometry', () => {
    const t=createTracker('sit-to-stand'); const p=points().map(v=>({...v,visibility:0}));
    const r=t.update(sample(p,0));
    expect(r.metric).toBeNull(); expect(r.reps).toBe(0); expect(r.feedback).toContain("Can't see your hips");
    expect(t.update(sample(points(),-1))).toBe(r);
    expect(t.update({...sample(points(),100),width:0}).metric).toBeNull();
  });
});
