import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base=process.env.APP_URL||'http://127.0.0.1:8092',work='/home/ubuntu/work/accuracy';
const manifest=await (await fetch(`${base}/tracker/asset-manifest.json`)).json();
const source=`import {PoseLandmarker} from '@mediapipe/tasks-vision';import {createTracker} from '@movecompass/pose';
window.compare=async({base,clip,exercise,seconds})=>{
  const files={wasmLoaderPath:base+'/vision_wasm_internal.js',wasmBinaryPath:base+'/vision_wasm_internal.wasm'};
  const all={};
  for(const variant of ['full','lite']){
    const detector=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:variant==='full'?base+'/pose_landmarker_full.task':'/comparison/lite.task',delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
    const tracker=createTracker(exercise),frames=[];
    for(let i=0;i<=Math.floor(seconds*10);i++){
      const at=i/10,image=new Image();image.src='/comparison/'+clip+'-'+String(i+1).padStart(4,'0')+'.png';await image.decode();
      const result=detector.detectForVideo(image,i*100+1);const out=tracker.update({landmarks:result.landmarks,worldLandmarks:result.worldLandmarks,timestampMs:i*100+1,width:image.width,height:image.height});frames.push({at,angles:out.angles,reps:out.reps});
    }
    detector.close();all[variant]=frames;
  }
  return all;
};`;
const bundle=await build({stdin:{contents:source,resolveDir:resolve('app')},bundle:true,write:false,format:'esm',minify:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const specs=[['squat','sit-to-stand',12.1,['leftKnee','rightKnee']],['press','wall-angels',14.05,['leftShoulder','rightShoulder','leftElbow','rightElbow']],['shoulder','wall-angels',11.9,['leftShoulder','rightShoulder','leftElbow','rightElbow']]];
const report=[];
try{
  for(const [clip,exercise,seconds,joints]of specs.filter(s=>!process.argv[2]||s[0]===process.argv[2])){
    const page=await browser.newPage();
    await page.route('**/comparison/*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop(),frame=name.match(/^(squat|press|shoulder)-(\d+)\.png$/);return route.fulfill({path:frame?`${work}/${frame[1]}-frames/frame-${frame[2]}.png`:`${work}/pose_landmarker_lite.task`,contentType:frame?'image/png':'application/octet-stream'});});
    await page.goto(`${base}/healthz`);await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});await page.waitForFunction(()=>typeof window.compare==='function');
    const result=await page.evaluate(args=>window.compare(args),{base:manifest.base,clip,exercise,seconds});
    const percentile=(a,p)=>a.sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]??null;
    const differences={};
    for(const joint of joints){const diffs=result.full.flatMap((frame,i)=>{const a=frame.angles[joint],b=result.lite[i].angles[joint];return a!==null&&b!==null?[Math.abs(a-b)]:[];});differences[joint]={frames:diffs.length,median:percentile(diffs,.5),p95:percentile(diffs,.95)};}
    const row={clip,exercise,frames:result.full.length,full:Math.max(...result.full.map(f=>f.reps)),lite:Math.max(...result.lite.map(f=>f.reps)),differences};report.push(row);
    await writeFile(`${work}/compare-${clip}-frames.json`,JSON.stringify(result));console.log(JSON.stringify(row));await page.close();
  }
  await writeFile(`${work}/model-comparison.json`,JSON.stringify(report,null,2));
}finally{await browser.close();}
