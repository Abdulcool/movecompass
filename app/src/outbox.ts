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
export async function queuedSetCounts(key:string){
  const today=new Date().toDateString(),counts:Record<string,number>={};
  for(const item of await read(key))if(new Date(item.completedAt).toDateString()===today)counts[item.exerciseId]=(counts[item.exerciseId]||0)+1;
  return counts;
}
export function flushSets(key:string,post:(item:PendingSet)=>Promise<{event:Event}>) {
  return exclusive(key,async()=>{
    let items=await read(key);const sent:Event[]=[],rejected:PendingSet[]=[];
    while(items.length) {
      const item=items[0];
      try {const {event}=await post(item);sent.push(event);items=(await read(key)).filter(i=>i.clientId!==item.clientId);await AsyncStorage.setItem(key,JSON.stringify(items));}
      catch(error) {
        if(error instanceof ApiError){
          if(error.status>=400&&error.status<500&&![401,408,429].includes(error.status)){
            const dead=await read(key+':rejected');
            await AsyncStorage.setItem(key+':rejected',JSON.stringify([...dead.filter(i=>i.clientId!==item.clientId),{...item,rejection:error.message}]));
            rejected.push(item);items=(await read(key)).filter(i=>i.clientId!==item.clientId);await AsyncStorage.setItem(key,JSON.stringify(items));continue;
          }
          return {sent,rejected,pending:items.length,error};
        }
        throw error;
      }
    }
    return {sent,rejected,pending:0,error:undefined};
  });
}
