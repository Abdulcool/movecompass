import {it,expect} from 'vitest';
import {createPersonSelector} from '../tracker/person';
const person=(x:number)=>Array.from({length:33},(_,i)=>({x:x+(i%2)*.08,y:.2+i*.015,visibility:1}));
it('tracks one person without an extra selection step',()=>{
  const select=createPersonSelector();expect(select.update([person(.3)]).index).toBe(0);
  expect(select.update([]).index).toBeNull();expect(select.update([person(.32)]).index).toBe(0);
});
it('requires a deliberate choice with multiple people and follows centroid rather than array order',()=>{
  const select=createPersonSelector();expect(select.update([person(.2),person(.7)]).needsSelection).toBe(true);
  select.choose([person(.2),person(.7)],{x:.2,y:.4});
  expect(select.update([person(.7),person(.21)]).index).toBe(1);
  expect(select.update([person(.73)]).index).toBeNull();
});
it('does not silently keep an automatic single-person choice when another person appears',()=>{
  const select=createPersonSelector();select.update([person(.2)]);
  expect(select.update([person(.2),person(.7)]).needsSelection).toBe(true);
});
it('supports deterministic patient hints and ignores missing/invalid poses',()=>{
  expect(createPersonSelector({x:.7,y:.4}).update([person(.2),person(.7)]).index).toBe(1);
  expect(createPersonSelector('largest').update([person(.2)]).index).toBe(0);
  const select=createPersonSelector();expect(select.choose([],{x:.5,y:.5})).toBe(false);
  expect(select.update([[{x:NaN,y:0,visibility:1}]]).index).toBeNull();
});
