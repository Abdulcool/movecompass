import {it,expect} from 'vitest';
import {extractAngles,type Landmark} from '../src/index';
it('measures cropped-hip shoulder abduction against image vertical with aspect correction',()=>{
  const p:Landmark[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
  p[11]={x:.4,y:.4,visibility:.9};p[13]={x:.6,y:.4,visibility:.8};
  const frame={landmarks:p,timestampMs:0,width:1280,height:720};
  expect(extractAngles(frame).angles.leftShoulder).toBeCloseTo(90);
  p[13].x=.4;p[13].y=.1;expect(extractAngles(frame).angles.leftShoulder).toBeCloseTo(180);
  p[13].y=.7;expect(extractAngles(frame).angles.leftShoulder).toBeCloseTo(0);
  p[13].visibility=.1;expect(extractAngles(frame).angles.leftShoulder).toBeNull();
  expect(extractAngles({...frame,landmarks:[]}).angles.leftShoulder).toBeNull();
});
