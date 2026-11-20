import AsyncStorage from '@react-native-async-storage/async-storage';
import {api} from './api';

export const pushStateKeys=['mc-push-token','mc-push-registered','mc-push-base'];
const prefix='mc-push-unregister:';
const pendingKey=(base:string,token:string)=>prefix+encodeURIComponent(base)+':'+encodeURIComponent(token);
let serial:Promise<unknown>=Promise.resolve();
function exclusive<T>(work:()=>Promise<T>){const next=serial.catch(()=>{}).then(work);serial=next;return next;}

async function removeSubscription(key:string,base:string,token:string){
  await api(base,'/api/push/register',undefined,{token},'DELETE');
  await AsyncStorage.removeItem(key);
  const active=await AsyncStorage.getItem('mc-push-token'),activeBase=await AsyncStorage.getItem('mc-push-base');
  if(active===token&&(!activeBase||activeBase===base))await AsyncStorage.multiRemove(pushStateKeys);
}
async function retryPending(){
  for(const key of (await AsyncStorage.getAllKeys()).filter(key=>key.startsWith(prefix))){
    try{
      const raw=await AsyncStorage.getItem(key);if(!raw)continue;
      const item=JSON.parse(raw);
      if(typeof item.base==='string'&&typeof item.token==='string')await removeSubscription(key,item.base,item.token);
    }catch{}
  }
}
export function retryPushUnregisters(){return exclusive(retryPending);}
export function unregisterPushSubscription(base:string){
  return exclusive(async()=>{
    const token=await AsyncStorage.getItem('mc-push-token');
    if(token){const key=pendingKey(base,token);await AsyncStorage.setItem(key,JSON.stringify({base,token}));await removeSubscription(key,base,token);}
    else await AsyncStorage.multiRemove(pushStateKeys);
  });
}
export function registerPushSubscription(base:string,bearer:string,token:string){
  return exclusive(async()=>{
    await retryPending();
    if(await AsyncStorage.getItem(pendingKey(base,token)))throw new Error('Reconnect to finish removing previous notifications before enabling them again.');
    await AsyncStorage.setItem('mc-push-token',token);await AsyncStorage.setItem('mc-push-base',base);
    await api(base,'/api/push/register',bearer,{token});
    await AsyncStorage.setItem('mc-push-registered',token);
  });
}
