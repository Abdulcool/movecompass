import type {PoseLandmarker} from '@mediapipe/tasks-vision';
export function createLegacyDetector(assets:{base:string;sizes:Record<string,number>},phase:(value:{phase:string;percent:number})=>void,timing:(value:Record<string,number|string>)=>void){
  let detector:PoseLandmarker|undefined,closed=false,first=true;
  let connections:{start:number;end:number}[]=[];
  const ready=(async()=>{
    phase({phase:'Preparing tracker · compatible CPU mode…',percent:10});
    const started=performance.now(),[{PoseLandmarker},model]=await Promise.all([import('@mediapipe/tasks-vision'),fetch(assets.base+'/pose_landmarker_full.task').then(response=>{if(!response.ok)throw new Error('Tracker download failed');return response.arrayBuffer();})]);
    if(closed)throw new Error('Tracker stopped');
    phase({phase:'Preparing full model · CPU…',percent:85});
    const createStarted=performance.now();
    const result=await PoseLandmarker.createFromOptions({wasmLoaderPath:assets.base+'/vision_wasm_internal.js',wasmBinaryPath:assets.base+'/vision_wasm_internal.wasm'},
      {baseOptions:{modelAssetBuffer:new Uint8Array(model),delegate:'CPU'},runningMode:'VIDEO',numPoses:3,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
    if(closed){result.close();throw new Error('Tracker stopped');}
    detector=result;connections=PoseLandmarker.POSE_CONNECTIONS;
    timing({delegate:'CPU (legacy browser)',createFromOptionsMs:performance.now()-createStarted,totalPreparationMs:performance.now()-started});
    phase({phase:'Tracker prepared · waiting for camera…',percent:95});
  })();
  return {ready,get connections(){return connections;},async detect(image:ImageData,timestampMs:number){await ready;if(closed)throw new Error('Tracker stopped');const at=performance.now(),result=detector!.detectForVideo(image,timestampMs);if(first){first=false;timing({firstDetectMs:performance.now()-at});}return result;},close(){closed=true;detector?.close();}};
}
