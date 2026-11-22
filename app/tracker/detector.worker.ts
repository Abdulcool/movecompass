import {PoseLandmarker} from '@mediapipe/tasks-vision';
const scope=globalThis as unknown as {Module?:Record<string,unknown>;onmessage:((event:MessageEvent)=>void)|null;postMessage:(message:unknown)=>void};
let detector:PoseLandmarker|undefined,first=true;
const timings:Record<string,number|string>={};
scope.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const started=performance.now(),{base,sizes}=data.assets as {base:string;sizes:Record<string,number>};
      const received:Record<string,number>={},total=Object.values(sizes).reduce((a,b)=>a+b,0);
      let compiled:WebAssembly.Module|undefined,model:Uint8Array|undefined,downloads=0;
      await Promise.all(Object.keys(sizes).map(async name=>{
        const response=await fetch(base+'/'+name);if(!response.ok)throw new Error('Tracker download failed. Please try again.');
        const compileStarted=performance.now();
        const compilation=name.endsWith('.wasm')?WebAssembly.compileStreaming(response.clone()).then(module=>{compiled=module;timings.streamingCompileMs=performance.now()-compileStarted;}):Promise.resolve();
        const chunks:Uint8Array[]=[],reader=response.body?.getReader();received[name]=0;
        if(reader)while(true){const {done,value}=await reader.read();if(done)break;received[name]+=value.length;if(name.endsWith('.task'))chunks.push(value);scope.postMessage({type:'phase',phase:'Downloading tracker…',percent:80*Object.values(received).reduce((a,b)=>a+b,0)/total});}
        else {const bytes=new Uint8Array(await response.arrayBuffer());received[name]=bytes.length;if(name.endsWith('.task'))chunks.push(bytes);}
        if(name.endsWith('.task')){model=new Uint8Array(received[name]);let offset=0;for(const chunk of chunks){model.set(chunk,offset);offset+=chunk.length;}}
        timings.downloadMs=Math.max(Number(timings.downloadMs)||0,performance.now()-started);
        if(++downloads===Object.keys(sizes).length)scope.postMessage({type:'phase',phase:'Preparing tracker · streaming WASM compile…',percent:82});
        await compilation;
      }));
      if(!compiled||!model)throw new Error('The local tracker assets are incomplete.');
      const files={wasmLoaderPath:base+'/vision_wasm_internal.js',wasmBinaryPath:base+'/vision_wasm_internal.wasm'};
      scope.Module={locateFile:(file:string)=>file.endsWith('.wasm')?files.wasmBinaryPath:file,instantiateWasm:(imports:WebAssembly.Imports,done:(instance:WebAssembly.Instance,module:WebAssembly.Module)=>void)=>{
        const at=performance.now();void WebAssembly.instantiate(compiled!,imports).then(instance=>{timings.wasmInstantiateMs=performance.now()-at;done(instance,compiled!);}).catch(error=>scope.postMessage({type:'error',message:String(error)}));return {};
      }};
      timings.delegate=data.delegate;
      scope.postMessage({type:'initializing',phase:`Preparing full model · ${data.delegate}…`,percent:85});
      const contextStarted=performance.now(),canvas=new OffscreenCanvas(320,320);
      if(data.delegate==='GPU'&&!canvas.getContext('webgl2'))throw new Error('GPU context unavailable');
      timings.gpuContextMs=performance.now()-contextStarted;
      const createStarted=performance.now();
      detector=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:model,delegate:data.delegate},canvas,runningMode:'VIDEO',numPoses:3,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
      timings.createFromOptionsMs=performance.now()-createStarted;timings.totalPreparationMs=performance.now()-started;
      scope.postMessage({type:'ready',timings,connections:PoseLandmarker.POSE_CONNECTIONS});
    }else if(data.type==='detect'&&detector){
      const started=performance.now(),result=detector.detectForVideo(data.image,data.timestampMs);
      if(first){first=false;timings.firstDetectMs=performance.now()-started;scope.postMessage({type:'timings',timings});}
      scope.postMessage({type:'result',landmarks:result.landmarks,worldLandmarks:result.worldLandmarks});
    }
  }catch(error){scope.postMessage({type:'error',name:error&&typeof error==='object'&&'name'in error?String(error.name):'',message:error instanceof Error?error.message:String(error)});}
};
