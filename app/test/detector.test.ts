import {it,expect,vi,afterEach} from 'vitest';
import {createDetector} from '../tracker/detector';
let mode='ready';
class WorkerStub {
  static all:WorkerStub[]=[];
  onmessage?:({data}:{data:any})=>void;onerror?:({message}:{message:string})=>void;
  terminated=false;delegate='';
  constructor(_url:string){WorkerStub.all.push(this);}
  emit(data:any){void Promise.resolve().then(()=>{if(!this.terminated)this.onmessage?.({data});});}
  postMessage(data:any){
    if(data.type==='init'){
      this.delegate=data.delegate;this.emit({type:'initializing',phase:'Preparing full model',percent:85});
      if(data.delegate!=='GPU'||mode!=='init-hang')this.emit({type:'ready',timings:{delegate:data.delegate},connections:[]});
    }else if(data.type==='detect'&&(this.delegate!=='GPU'||mode!=='detect-hang'))this.emit({type:'result',landmarks:[],worldLandmarks:[]});
  }
  terminate(){this.terminated=true;}
}
function create(){
  WorkerStub.all=[];vi.stubGlobal('Worker',WorkerStub);vi.stubGlobal('OffscreenCanvas',class{});
  return createDetector('/worker.js',{base:'/assets',sizes:{}},()=>{},()=>{});
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('prepares without accessing the camera and accepts empty detections',async()=>{
  mode='ready';const detector=create();await detector.ready;
  expect(await detector.detect({} as ImageData,1)).toMatchObject({landmarks:[]});detector.close();expect(WorkerStub.all[0].terminated).toBe(true);
});
it.each(['init-hang','detect-hang'])('terminates a stuck GPU worker and retries safely on CPU: %s',async scenario=>{
  vi.useFakeTimers();mode=scenario;const detector=create();
  let pending:Promise<unknown>;
  if(scenario==='detect-hang'){await detector.ready;pending=detector.detect({} as ImageData,1);}else pending=detector.ready;
  await vi.advanceTimersByTimeAsync(7001);await pending;
  expect(WorkerStub.all.map(w=>w.delegate)).toEqual(['GPU','CPU']);expect(WorkerStub.all[0].terminated).toBe(true);detector.close();
});
it('cancels initialization when the screen is closed',async()=>{
  mode='init-hang';const detector=create();const rejected=expect(detector.ready).rejects.toThrow('Tracker stopped');detector.close();await rejected;
});
