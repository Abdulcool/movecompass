import {it,expect,vi} from 'vitest';
const storage=vi.hoisted(()=>new Map<string,string>());
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem:async(k:string)=>storage.get(k)||null,setItem:async(k:string,v:string)=>{storage.set(k,v);}}}));
import {replayFrom,markToastShown} from '../src/unread-toasts';
it('replays queued unread events after reload despite an advanced receive cursor',async()=>{
  await markToastShown('staff',1);
  expect(replayFrom('3',storage.get('staff')!)).toBe(1);
  await Promise.all([markToastShown('staff',2),markToastShown('staff',1)]);
  expect(replayFrom('3',storage.get('staff')!)).toBe(2);
  expect(replayFrom('1','3')).toBe(1);
});
it('handles first load, invalid cursors and invalid shown events without losing unread history',async()=>{
  expect(replayFrom(null,null)).toBe(0);expect(replayFrom('3','bad')).toBe(0);
  await markToastShown('invalid',NaN);expect(storage.has('invalid')).toBe(false);
});
