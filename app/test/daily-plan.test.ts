import {it,expect} from 'vitest';
import {remainingExercises} from '../src/daily-plan';
it('skips completed prescriptions but keeps partially completed sets in order',()=>{
  const plan=[{id:'wall-angels',sets:2},{id:'pendulum',sets:2}];
  expect(remainingExercises(plan,{'wall-angels':2,pendulum:1})).toEqual([plan[1]]);
  expect(remainingExercises(plan,{})).toEqual(plan);
  expect(remainingExercises([],{})).toEqual([]);
  expect(remainingExercises(plan,{'wall-angels':3,pendulum:2})).toEqual([]);
});
