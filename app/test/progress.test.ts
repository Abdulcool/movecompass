import { it, expect } from 'vitest';
import { setProgress } from '../tracker/progress';
it('keeps counted reps and ROM across camera stop/retry and tab-hide segments',()=>{
  const p=setProgress(2,{leftKnee:45});p.begin();
  expect(p.update(3,{leftKnee:60}).reps).toBe(5);
  p.begin();expect(p.update(0,{})).toEqual({reps:5,angles:{leftKnee:60}});
  expect(p.update(1,{leftKnee:20})).toEqual({reps:6,angles:{leftKnee:60}});
});
