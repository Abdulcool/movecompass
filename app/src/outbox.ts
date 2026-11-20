import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, type Event } from './api';
export interface PendingSet {
  clientId: string; exerciseId: string; exerciseName: string; reps: number;
  source: 'manual' | 'camera'; angles: Record<string,number>; completedAt: string;
}
let serial: Promise<unknown> = Promise.resolve();
function exclusive<T>(key:string,work:()=>Promise<T>) {
  const run=()=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(key,work):work();
  const result=serial.catch(()=>{}).then(run);serial=result;return result;
}
export function outboxKey(base: string, userId: string) {return `mc-outbox:${base}:${userId}`;}
async function read(key:string):Promise<PendingSet[]> {
  const raw=await AsyncStorage.getItem(key);if(!raw)return [];
  const data=JSON.parse(raw);if(!Array.isArray(data))throw new Error("Your saved sets need review. Please contact your care team before clearing this device.");
  return data;
}
export function enqueueSet(key:string,item:PendingSet) {
  return exclusive(key,async()=>{const items=await read(key);if(!items.some(i=>i.clientId===item.clientId))items.push(item);await AsyncStorage.setItem(key,JSON.stringify(items));return items.length;});
}
export function flushSets(key:string,post:(item:PendingSet)=>Promise<{event:Event}>) {
  return exclusive(key,async()=>{
    let items=await read(key);const sent:Event[]=[];
    while(items.length) {
      try {const item=items[0],{event}=await post(item);sent.push(event);items=(await read(key)).filter(i=>i.clientId!==item.clientId);await AsyncStorage.setItem(key,JSON.stringify(items));}
      catch(error) {
        if(error instanceof ApiError)return {sent,pending:items.length,error};
        throw error;
      }
    }
    return {sent,pending:0,error:undefined};
  });
}
