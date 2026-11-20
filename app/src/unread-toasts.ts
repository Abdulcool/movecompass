import AsyncStorage from '@react-native-async-storage/async-storage';
const seq=(raw:string|null)=>raw!==null&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):0;
export function replayFrom(received:string|null,shown:string|null){return Math.min(seq(received),seq(shown));}
let writes:Promise<unknown>=Promise.resolve();
export function markToastShown(key:string,value:number){
  if(!key||!Number.isSafeInteger(value)||value<0)return Promise.resolve();
  const pending=writes.catch(()=>{}).then(async()=>{const previous=seq(await AsyncStorage.getItem(key));if(value>previous)await AsyncStorage.setItem(key,String(value));});
  writes=pending;return pending;
}
