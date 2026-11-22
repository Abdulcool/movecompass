import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createTracker,type Landmark} from '../src/index';
function frame(angle:number,at:number){
  const image:Landmark[]=Array.from({length:33},()=>({x:0,y:0,visibility:0})),world=image.map(p=>({...p}));
  for(const i of[11,13,15])image[i]={x:.4,y:.2+(i-11)*.1,visibility:1};
  world[11]={x:0,y:1,z:0,visibility:1};world[13]={x:0,y:0,z:0,visibility:1};
  world[15]={x:Math.sin(angle*Math.PI/180),y:Math.cos(angle*Math.PI/180),z:0,visibility:1};
  return {landmarks:image,worldLandmarks:world,timestampMs:at,width:640,height:480};
}
it('counts relative flexion and return without demanding an absolute 95/150 degree range',()=>{
  const tracker=createTracker('seated-row');let output;
  for(let i=0;i<65;i++)output=tracker.update(frame(i>=18&&i<38?105:142,i*100));
  expect(output!.reps).toBe(1);expect(output!.missing).toEqual([]);
});
it('rejects short range and empty frames and resets the extended-arm baseline per set',()=>{
  const tracker=createTracker('seated-row');let output;
  for(let i=0;i<65;i++)output=tracker.update(frame(i>=18&&i<38?126:142,i*100));
  expect(output!.reps).toBe(0);tracker.reset();
  expect(tracker.update({...frame(142,0),landmarks:[]}).metric).toBeNull();
});
it('keeps four completed returns in a real oblique landmark trace',()=>{
  const data=JSON.parse(readFileSync(new URL('./fixtures/seated-row-crossfit.json',import.meta.url),'utf8'));
  const tracker=createTracker('seated-row');let output;
  const expand=(points:Record<string,Landmark>)=>Array.from({length:33},(_,i)=>points[String(i)]||{x:0,y:0,visibility:0});
  for(const frame of data.frames)output=tracker.update({landmarks:expand(frame.p),worldLandmarks:expand(frame.w),timestampMs:frame.t,width:data.width,height:data.height});
  expect(output!.reps).toBe(4);
});
