import {it,expect} from 'vitest';
import {visible,visibleInFrame,missingBodyParts,createTracker} from '../src/index';
it('rejects low presence and out-of-image drawing points without restricting world geometry',()=>{
  expect(visibleInFrame({x:.2,y:.3,visibility:1,presence:.2})).toBe(false);
  expect(visibleInFrame({x:1.2,y:.3,visibility:1})).toBe(false);
  expect(visible({x:-1.2,y:2,visibility:1})).toBe(true);
  expect(visibleInFrame({x:NaN,y:0,visibility:1})).toBe(false);
});
it('does not warn for a hidden far arm when the near arm is measurable',()=>{
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
  for(const i of [12,14,16])p[i].visibility=1;
  expect(missingBodyParts('seated-row',p)).toEqual([]);
  p[16].visibility=0;expect(missingBodyParts('seated-row',p)).toEqual(['wrists']);
});
it('names missing required joints instead of giving form coaching',()=>{
  const out=createTracker('hip-shift').update({landmarks:[],timestampMs:0,width:640,height:480});
  expect(out.feedback).toContain("Can't see your hips");expect(out.feedback).not.toContain('Keep chest');expect(out.reps).toBe(0);
});
