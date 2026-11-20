import { it,expect,vi,beforeEach } from 'vitest';
const storage=vi.hoisted(()=>new Map<string,string>());
vi.mock('react-native',()=>({Platform:{OS:'web'}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem:async(k:string)=>storage.get(k)||null,setItem:async(k:string,v:string)=>{storage.set(k,v);}}}));
import { enqueueSet,flushSets,type PendingSet } from '../src/outbox';
import { ApiError } from '../src/api';
beforeEach(()=>storage.clear());
it('keeps one durable set offline then retries it without losing ROM',async()=>{
  const item:PendingSet={clientId:'uuid',exerciseId:'wall-angels',exerciseName:'Wall angels',reps:3,source:'camera',angles:{leftShoulder:80},completedAt:new Date().toISOString()};
  await enqueueSet('patient-a',item);await enqueueSet('patient-a',item);
  const failed=await flushSets('patient-a',async()=>{throw new ApiError('offline',0);});expect(failed.pending).toBe(1);
  const post=vi.fn().mockResolvedValue({event:{id:'one',...item}});
  expect((await flushSets('patient-a',post)).pending).toBe(0);expect(post).toHaveBeenCalledExactlyOnceWith(item);
  expect((await flushSets('patient-b',post)).sent).toEqual([]);
});
it('retains a set added by another tab while a request is in flight',async()=>{
  const item:PendingSet={clientId:'one',exerciseId:'wall-angels',exerciseName:'Wall angels',reps:3,source:'camera',angles:{},completedAt:new Date().toISOString()};
  await enqueueSet('tabs',item);
  const result=await flushSets('tabs',async current=>{
    if(current.clientId==='one'){
      storage.set('tabs',JSON.stringify([item,{...item,clientId:'two'}]));
      return {event:{id:'saved-one',...item} as any};
    }
    throw new ApiError('offline',0);
  });
  expect(result.sent).toHaveLength(1);expect(result.pending).toBe(1);
  expect(JSON.parse(storage.get('tabs')!).map((i:PendingSet)=>i.clientId)).toEqual(['two']);
});
it('dead-letters a permanent rejection then sends later sets',async()=>{
  const item:PendingSet={clientId:'bad',exerciseId:'wall-angels',exerciseName:'Wall angels',reps:3,source:'camera',angles:{},completedAt:new Date().toISOString()};
  await enqueueSet('reject',item);await enqueueSet('reject',{...item,clientId:'good'});
  const result=await flushSets('reject',async current=>{if(current.clientId==='bad')throw new ApiError('Future date',400);return {event:{id:'saved',...current} as any};});
  expect(result.pending).toBe(0);expect(result.rejected).toEqual([item]);expect(result.sent).toHaveLength(1);
  expect(JSON.parse(storage.get('reject:rejected')!)).toEqual([{...item,rejection:'Future date'}]);
});
it.each([401,408,429,500,0])('retains retryable HTTP %i sets',async status=>{
  const item:PendingSet={clientId:'retry',exerciseId:'wall-angels',exerciseName:'Wall angels',reps:3,source:'camera',angles:{},completedAt:new Date().toISOString()};
  await enqueueSet('retry',item);const result=await flushSets('retry',async()=>{throw new ApiError('retry',status);});
  expect(result.pending).toBe(1);expect(result.rejected).toEqual([]);expect(storage.has('retry:rejected')).toBe(false);
});
