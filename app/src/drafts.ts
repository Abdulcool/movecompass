import AsyncStorage from '@react-native-async-storage/async-storage';
export interface SetDraft { exerciseId: string; clientId: string; reps: number; angles: Record<string, number> }
let writes: Promise<unknown> = Promise.resolve();
export function draftKey(base: string, userId: string, exerciseId: string) { return `mc-set:${base}:${userId}:${exerciseId}`; }
export async function loadDraft(key: string): Promise<SetDraft | null> {
  const raw=await AsyncStorage.getItem(key);
  if(!raw)return null;
  try {
    const d=JSON.parse(raw);
    if(typeof d.exerciseId!=='string' || typeof d.clientId!=='string' || !Number.isInteger(d.reps) || d.reps<1 || d.reps>100 || !d.angles || typeof d.angles!=='object')return null;
    if(Object.values(d.angles).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>360))return null;
    return d;
  } catch {return null;}
}
export function storeDraft(key: string, draft: SetDraft) {
  writes=writes.catch(()=>{}).then(()=>AsyncStorage.setItem(key,JSON.stringify(draft)));return writes;
}
export function removeDraft(key: string) {
  writes=writes.catch(()=>{}).then(()=>AsyncStorage.removeItem(key));return writes;
}
