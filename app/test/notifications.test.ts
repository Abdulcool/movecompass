import { it, expect, vi, beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),remove:vi.fn(),api:vi.fn()}));
vi.mock('react-native',()=>({Platform:{OS:'ios'}}));
vi.mock('expo-constants',()=>({default:{}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem:mocks.get,multiRemove:mocks.remove}}));
vi.mock('../src/api',()=>({api:mocks.api}));
import { unregisterNotifications } from '../src/notifications';
beforeEach(()=>{vi.resetAllMocks();});
it('deletes only this device push registration before clearing local state',async()=>{
  mocks.get.mockResolvedValue('ExponentPushToken[device]');
  await unregisterNotifications('https://example.test','jwt');
  expect(mocks.api).toHaveBeenCalledWith('https://example.test','/api/push/register','jwt',{token:'ExponentPushToken[device]'},'DELETE');
  expect(mocks.remove).toHaveBeenCalled();
});
it('keeps registration for retry when the server cannot unregister it',async()=>{
  mocks.get.mockResolvedValue('ExponentPushToken[device]');mocks.api.mockRejectedValue(new Error('offline'));
  await expect(unregisterNotifications('https://example.test','jwt')).rejects.toThrow('offline');
  expect(mocks.remove).not.toHaveBeenCalled();
});
