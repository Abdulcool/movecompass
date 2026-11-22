import { it,expect } from 'vitest';
import { mergeEvents } from '../src/event-history';
import type { Event } from '../src/api';
it('keeps a newer live set when an older history snapshot arrives later',()=>{
  const old={id:'old',seq:1,completedAt:'2026-01-01T00:00:00Z'} as Event,newer={id:'new',seq:2,completedAt:'2026-01-01T00:00:01Z'} as Event;
  expect(mergeEvents([old],[newer,old]).map(e=>e.id)).toEqual(['new','old']);
  expect(mergeEvents([],[])).toEqual([]);
  expect(mergeEvents([old],[{...old,reps:6}])[0].reps).toBe(6);
});
