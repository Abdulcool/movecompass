import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({storage:new Map<string,string>(),remove:vi.fn(),api:vi.fn()}));
const local=vi.hoisted(()=>({getPermissionsAsync:vi.fn(),scheduleNotificationAsync:vi.fn()}));
vi.mock('expo-notifications',()=>local);
vi.mock('react-native',()=>({Platform:{OS:'ios'}}));
vi.mock('expo-constants',()=>({default:{}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{
  getItem:async(key:string)=>mocks.storage.get(key)||null,
  setItem:async(key:string,value:string)=>{mocks.storage.set(key,value);},
  removeItem:async(key:string)=>{mocks.storage.delete(key);},
  getAllKeys:async()=>[...mocks.storage.keys()],
  multiRemove:async(keys:string[])=>{mocks.remove(keys);for(const key of keys)mocks.storage.delete(key);},
}}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),api:mocks.api}));
import {unregisterNotifications,notify} from '../src/notifications';
import {registerPushSubscription,retryPushUnregisters} from '../src/push-subscription';
import {clearSession} from '../src/logout';
import {ApiError} from '../src/api';
const base='https://example.test',push='ExponentPushToken[device]';
const pending=()=>[...mocks.storage.keys()].filter(key=>key.startsWith('mc-push-unregister:'));
const seed=()=>{mocks.storage.set('mc-push-token',push);mocks.storage.set('mc-push-registered',push);mocks.storage.set('mc-push-base',base);};
beforeEach(()=>{vi.resetAllMocks();mocks.storage.clear();});
it('deletes only the possessed push registration without a JWT before clearing local state',async()=>{
  seed();await unregisterNotifications(base);
  expect(mocks.api).toHaveBeenCalledWith(base,'/api/push/register',undefined,{token:push},'DELETE');
  expect(pending()).toEqual([]);expect(mocks.storage.has('mc-push-token')).toBe(false);
});
it('durably queues an unsuccessful unregister and retries it without any auth state',async()=>{
  seed();mocks.api.mockRejectedValue(new Error('offline'));
  await expect(unregisterNotifications(base)).rejects.toThrow('offline');
  expect(pending()).toHaveLength(1);expect(mocks.remove).not.toHaveBeenCalled();
  mocks.storage.delete('mc-push-token');mocks.storage.delete('mc-push-registered');mocks.api.mockResolvedValue({ok:true});
  await retryPushUnregisters();expect(pending()).toEqual([]);
  expect(mocks.api).toHaveBeenLastCalledWith(base,'/api/push/register',undefined,{token:push},'DELETE');
});
it('removes the subscription before clearing an expired local JWT',async()=>{
  seed();mocks.storage.set('mc-token','expired');mocks.storage.set('mc-user','patient');
  mocks.api.mockImplementation(async(_base,path)=>{if(path==='/api/auth/logout')throw new ApiError('Expired',401);return {ok:true};});
  await clearSession(base,'expired');expect(mocks.storage.has('mc-token')).toBe(false);expect(pending()).toEqual([]);
  expect(mocks.api.mock.calls[0][4]).toBe('DELETE');
});
it('keeps pending proof after an auth error clears the local session',async()=>{
  seed();mocks.api.mockRejectedValue(new ApiError('Expired',401));
  await clearSession(base,'expired');expect(pending()).toHaveLength(1);expect(mocks.storage.has('mc-push-token')).toBe(false);
  mocks.api.mockResolvedValue({ok:true});await retryPushUnregisters();expect(pending()).toEqual([]);
});
it('does not re-register a token until its previous unregister finishes',async()=>{
  seed();mocks.api.mockRejectedValue(new Error('offline'));
  await expect(unregisterNotifications(base)).rejects.toThrow('offline');
  await expect(registerPushSubscription(base,'new-jwt',push)).rejects.toThrow('Reconnect');
  expect(mocks.api.mock.calls.every(call=>call[4]==='DELETE')).toBe(true);
  mocks.api.mockResolvedValue({ok:true});await registerPushSubscription(base,'new-jwt',push);
  expect(pending()).toEqual([]);expect(mocks.storage.get('mc-push-registered')).toBe(push);
});
it('leaves a new backend registration active while removing an older backend subscription',async()=>{
  seed();mocks.api.mockRejectedValue(new Error('offline'));await expect(unregisterNotifications(base)).rejects.toThrow('offline');
  mocks.storage.set('mc-push-base','https://other.test');mocks.api.mockResolvedValue({ok:true});
  await retryPushUnregisters();expect(pending()).toEqual([]);expect(mocks.storage.get('mc-push-registered')).toBe(push);
});
it('handles no queued subscriptions and does not duplicate remote push locally',async()=>{
  await retryPushUnregisters();expect(mocks.api).not.toHaveBeenCalled();
  mocks.storage.set('mc-push-registered','registered');await notify('completion');expect(local.scheduleNotificationAsync).not.toHaveBeenCalled();
  mocks.storage.clear();local.getPermissionsAsync.mockResolvedValue({granted:true});await notify('completion');expect(local.scheduleNotificationAsync).toHaveBeenCalledOnce();
});
