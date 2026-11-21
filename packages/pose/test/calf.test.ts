import {it,expect} from 'vitest';
import {createTracker,type Landmark} from '../src/index';
import {calfLift,visibleLeg} from '../src/calf';
function leg(side:'left'|'right',lift=0){
  const p:Landmark[]=Array.from({length:33},()=>({x:0,y:0,visibility:0})),n=side==='left'?0:1;
  p[25+n]={x:.5,y:.4,visibility:.9};p[27+n]={x:.5,y:.7-lift,visibility:.9};
  p[29+n]={x:.48,y:.74-lift,visibility:.9};p[31+n]={x:.56,y:.75,visibility:.9};return p;
}
it.each(['left','right'] as const)('counts a side-view raise with only the %s leg visible',side=>{
  const tracker=createTracker('calf-raise');let output;
  for(let i=0;i<65;i++)output=tracker.update({landmarks:leg(side,i>=18&&i<38?.035:0),timestampMs:i*100,width:640,height:480});
  expect(output!.reps).toBe(1);expect(output!.missing).toEqual([]);
});
it('selects visibility, remains stable near a tie, and rejects empty or invalid geometry',()=>{
  const a=leg('left'),b=leg('right');for(const i of[26,28,30,32])a[i]=b[i];
  expect(visibleLeg(a,'right')).toBe('right');a[25].visibility=.5;expect(visibleLeg(a)).toBe('right');
  expect(calfLift([],640,480)).toBeNull();expect(calfLift(leg('left'),0,480)).toBeNull();
  const hidden=leg('left');hidden[27].presence=.1;expect(calfLift(hidden,640,480)).toBeNull();
});
