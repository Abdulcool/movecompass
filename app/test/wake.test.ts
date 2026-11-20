import { it,expect,vi } from 'vitest';
vi.mock('react-native',()=>({Platform:{OS:'native'}}));
import { wakeRetry } from '../src/wake';
import { ApiError } from '../src/api';
it('retries a sleeping server, then returns the login result',async()=>{
  let now=0,calls=0;const waiting=vi.fn();
  expect(await wakeRetry(async()=>{if(calls++===0)throw new ApiError('Sleeping',503);return 'signed in';},waiting,()=>now,async ms=>{now+=ms;})).toBe('signed in');
  expect(waiting).toHaveBeenCalledOnce();
});
it('stops at 90 seconds and never retries authentication failures',async()=>{
  let now=0;
  await expect(wakeRetry(async()=>{throw new ApiError('Offline',0);},()=>{},()=>now,async ms=>{now+=ms;})).rejects.toThrow('still waking');
  expect(now).toBe(90000);
  const bad=vi.fn(async()=>{throw new ApiError('Wrong password',401);});
  await expect(wakeRetry(bad,()=>{})).rejects.toThrow('Wrong password');expect(bad).toHaveBeenCalledOnce();
});
