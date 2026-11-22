import {visibleInFrame,type Landmark} from './angles';
export function missingBodyParts(id:string,p:Landmark[]):string[]{
  const alternatives=id==='wall-angels'?[[11,13],[12,14]]:id==='seated-row'?[[11,13,15],[12,14,16]]:id==='sit-to-stand'?[[23,25,27],[24,26,28]]:id==='calf-raise'?[[25,27,31],[26,28,32]]:id==='pendulum'?[[11,12,15],[11,12,16]]:[[23,24,27,28]];
  const missing=alternatives.map(ids=>ids.filter(i=>!visibleInFrame(p[i]))).sort((a,b)=>a.length-b.length)[0];
  const names=(i:number)=>i===11||i===12?'shoulders':i===13||i===14?'elbows':i===15||i===16?'wrists':i===23||i===24?'hips':i===25||i===26?'knees':i===27||i===28?'ankles':'feet';
  return [...new Set(missing.map(names))];
}
