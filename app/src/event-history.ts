import type { Event } from './api';
export function mergeEvents(history:Event[],live:Event[],limit=200) {
  return Array.from(new Map([...history,...live].map(e=>[e.id,e])).values()).sort((a,b)=>(b.seq??0)-(a.seq??0)||Date.parse(b.completedAt)-Date.parse(a.completedAt)).slice(0,limit);
}
