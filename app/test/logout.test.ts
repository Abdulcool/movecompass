import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({remove:vi.fn(),unregister:vi.fn(),api:vi.fn()}));
vi.mock('react-native',()=>({Platform:{OS:'web'}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{multiRemove:mocks.remove}}));
vi.mock('../src/notifications',()=>({unregisterNotifications:mocks.unregister}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),api:mocks.api}));
import {ApiError} from '../src/api';
import {clearSession} from '../src/logout';
beforeEach(()=>vi.resetAllMocks());
it('revokes and clears a valid local session',async()=>{
 await clearSession('https://example.test','jwt');expect(mocks.api).toHaveBeenCalledWith('https://example.test','/api/auth/logout','jwt',{});expect(mocks.remove).toHaveBeenCalledOnce();
});
it.each([401,403])('clears local auth when logout or unregister returns %i',async status=>{
 for(const failing of [mocks.unregister,mocks.api]){vi.resetAllMocks();failing.mockRejectedValue(new ApiError('Expired',status));await clearSession('https://example.test','jwt');expect(mocks.remove).toHaveBeenCalledWith(['mc-token','mc-user','mc-push-token','mc-push-registered']);}
});
it('retains credentials on a network failure for safe retry',async()=>{
 mocks.api.mockRejectedValue(new ApiError('Offline',0));await expect(clearSession('https://example.test','jwt')).rejects.toThrow('Offline');expect(mocks.remove).not.toHaveBeenCalled();
});
