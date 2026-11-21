import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const work=process.env.ACCURACY_WORK||'/home/ubuntu/work/accuracy2',mode=process.env.MODE||'after',rate=process.env.FPS||'15',base=process.env.APP_URL||'http://127.0.0.1:8091';
const delegate=process.env.DELEGATE||'GPU',variant=delegate==='GPU'?mode:mode+'-'+delegate;
const framing='uncropped-640-v1';
if(!['GPU','CPU'].includes(delegate))throw new Error('DELEGATE must be GPU or CPU');
const rows=JSON.parse(execFileSync('python3',['-c',`import csv,json;print(json.dumps(list(csv.DictReader(open('${work}/clips/clips.csv')))))`],{encoding:'utf8'}));
rows.push(...[['squat','sit-to-stand',2],['press','wall-angels',1],['shoulder','wall-angels',2]].map(([name,exercise,true_reps])=>({file:`legacy/${name}.webm`,path:`/home/ubuntu/work/accuracy/${name}-bounded.webm`,exercise,true_reps})));
const specs=rows.filter(r=>!process.env.ONLY||r.file.includes(process.env.ONLY));
const poseImport=mode==='baseline'?`${work}/baseline/packages/pose/src/index.ts`:'@movecompass/pose';
const source=`import {PoseLandmarker} from '@mediapipe/tasks-vision';import {createTracker} from ${JSON.stringify(poseImport)};
import {createPersonSelector} from './tracker/person';import {enhanceDimFrame} from './tracker/lighting';
window.runAccuracy=async(spec)=>{
 const detector=await PoseLandmarker.createFromOptions({wasmLoaderPath:spec.assets+'/vision_wasm_internal.js',wasmBinaryPath:spec.assets+'/vision_wasm_internal.wasm'},
 {baseOptions:{modelAssetPath:spec.assets+'/pose_landmarker_full.task',delegate:spec.delegate},runningMode:'VIDEO',numPoses:spec.baseline?1:3,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
 const tracker=createTracker(spec.exercise),selector=createPersonSelector(spec.hint||'largest'),traces=[];
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 let last=-1;
 for(let i=-Math.round(3*spec.fps);i<spec.frames;i++){
   const image=new Image();image.src='/accuracy2/'+spec.id+'/'+String(Math.max(0,i)+1).padStart(5,'0')+'.png';await image.decode();
   canvas.width=image.width;canvas.height=image.height;ctx.drawImage(image,0,0);
   if(!spec.baseline){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);if(enhanceDimFrame(pixels.data).enhanced)ctx.putImageData(pixels,0,0);}
   const timestampMs=(i+Math.round(3*spec.fps))*1000/spec.fps+1,result=detector.detectForVideo(canvas,timestampMs);
   const picked=spec.baseline?0:selector.update(result.landmarks).index;
   const landmarks=picked===null?[]:result.landmarks[picked]||[],worldLandmarks=picked===null?[]:result.worldLandmarks[picked]||[];
   const output=tracker.update({landmarks,worldLandmarks,width:canvas.width,height:canvas.height,timestampMs});
   traces.push({at:i/spec.fps,timestampMs,landmarks,worldLandmarks,...output});
   if(output.reps!==last){last=output.reps;console.log(spec.file+' '+last+' @ '+(i/spec.fps).toFixed(2));}
 }
 detector.close();return {traces,width:canvas.width,height:canvas.height};
};`;
const bundle=await build({stdin:{contents:source,resolveDir:resolve('app')},bundle:true,write:false,format:'esm',minify:true});
const manifest=await(await fetch(base+'/tracker/asset-manifest.json')).json();
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const results=[];let next=0;
try{await Promise.all(Array.from({length:Number(process.env.WORKERS||3)},async()=>{
 while(next<specs.length){const row=specs[next++],id=row.file.replace(/\.[^.]+$/,'').replaceAll('/','--'),path=row.path||`${work}/clips/${row.file}`;
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=avg_frame_rate,width,height:format=duration','-of','json',path],{encoding:'utf8'}));
 const [n,d]=probe.streams[0].avg_frame_rate.split('/').map(Number),fps=rate==='native'?n/d:Number(rate),folder=`${work}/frames-${framing}-${rate}/${id}`,output=`${work}/${variant}-${framing}-${rate}-${id}.json`;
 try{const previous=JSON.parse(await readFile(output,'utf8'));results.push(previous.summary);console.log('CACHED '+JSON.stringify(previous.summary));continue;}catch{}
 await mkdir(folder,{recursive:true});
 if(!(await readdir(folder)).length)execFileSync('ffmpeg',['-y','-loglevel','error','-i',path,'-vf',`scale=640:-2,fps=${fps}`,'-threads','1','-compression_level','1',folder+'/%05d.png']);
 const frames=(await readdir(folder)).filter(f=>f.endsWith('.png')).length;
 const page=await browser.newPage();await page.route('**/accuracy2/**',route=>route.fulfill({path:folder+'/'+new URL(route.request().url()).pathname.split('/').pop(),contentType:'image/png'}));
 await page.goto(base+'/healthz');await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});await page.waitForFunction(()=>typeof window.runAccuracy==='function');
 console.log('START '+mode+' '+rate+' '+row.file+' '+frames+' frames');
 const result=await page.evaluate(spec=>window.runAccuracy(spec),{id,file:row.file,exercise:row.exercise,frames,fps,delegate,baseline:mode==='baseline',assets:base+manifest.base,hint:row.file.includes('nia-group')?{x:.21,y:.43}:undefined});
 const summary={file:row.file,exercise:row.exercise,true:Number(row.true_reps),fps,frames,delegate,framing,reps:result.traces.at(-1)?.reps||0};
 await writeFile(output,JSON.stringify({...result,summary}));results.push(summary);console.log(JSON.stringify(summary));await page.close();
 }
}));await writeFile(`${work}/${variant}-${framing}-${rate}-summary.json`,JSON.stringify(results,null,2));}finally{await browser.close();}
