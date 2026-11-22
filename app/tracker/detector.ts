import type {Landmark} from '@movecompass/pose';
import {createLegacyDetector} from './legacy-detector';
export type PoseResult={landmarks:Landmark[][];worldLandmarks:Landmark[][]};
type Assets={base:string;sizes:Record<string,number>};
type Phase={phase:string;percent:number};
export function createDetector(workerUrl:string,assets:Assets,phase:(value:Phase)=>void,timing:(value:Record<string,number|string>)=>void){
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return createLegacyDetector(assets,phase,timing);
  let worker:Worker|undefined,closed=false,delegate:'GPU'|'CPU'='GPU';
  let initReject:((error:Error)=>void)|undefined,resolveResult:((result:PoseResult)=>void)|undefined,rejectResult:((error:Error)=>void)|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined,first=true;
  let connections:{start:number;end:number}[]=[];
  const cancel=()=>{clearTimeout(timer);worker?.terminate();worker=undefined;};
  function boot(target:'GPU'|'CPU'):Promise<void>{
    cancel();if(closed)return Promise.reject(new Error('Tracker stopped'));
    delegate=target;try{worker=new Worker(workerUrl);}catch(error){return Promise.reject(error);}
    return new Promise((resolve,reject)=>{
      initReject=reject;
      worker!.onerror=event=>{clearTimeout(timer);reject(new Error(event.message));rejectResult?.(new Error(event.message));};
      worker!.onmessage=({data})=>{
        if(data.type==='phase'||data.type==='initializing')phase(data);
        if(data.type==='initializing'&&target==='GPU')timer=setTimeout(()=>{timing({gpuTimeoutMs:7000});reject(new Error('GPU initialization timed out'));},7000);
        if(data.type==='ready'){clearTimeout(timer);connections=data.connections;phase({phase:'Tracker prepared · waiting for camera…',percent:95});timing(data.timings);resolve();}
        if(data.type==='timings')timing(data.timings);
        if(data.type==='result'){clearTimeout(timer);const done=resolveResult;resolveResult=rejectResult=undefined;done?.(data);}
        if(data.type==='error'){clearTimeout(timer);const error=Object.assign(new Error(data.message),{name:data.name||'Error'});reject(error);rejectResult?.(error);}
      };
      worker!.postMessage({type:'init',delegate:target,assets});
    });
  }
  const ready=boot('GPU').catch(error=>{if(closed)throw error;phase({phase:'Preparing tracker · trying CPU fallback…',percent:84});return boot('CPU');});
  async function send(image:ImageData,timestampMs:number):Promise<PoseResult>{
    return new Promise((resolve,reject)=>{
      if(closed){reject(new Error('Tracker stopped'));return;}
      resolveResult=resolve;rejectResult=reject;
      if(first&&delegate==='GPU')timer=setTimeout(()=>{timing({gpuFirstDetectTimeoutMs:7000});reject(new Error('GPU first detection timed out'));},7000);
      worker!.postMessage({type:'detect',image,timestampMs});
    });
  }
  return {ready,get connections(){return connections;},
    async detect(image:ImageData,timestampMs:number){
      await ready;
      try{const result=await send(image,timestampMs);first=false;return result;}
      catch(error){if(!first||delegate!=='GPU'||closed)throw error;await boot('CPU');const result=await send(image,timestampMs);first=false;return result;}
    },
    close(){closed=true;cancel();initReject?.(new Error('Tracker stopped'));rejectResult?.(new Error('Tracker stopped'));},
  };
}
