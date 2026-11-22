import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:400,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.fixtureFrames=0;
    class FixtureWorker{
      postMessage(data){
        if(data.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready',connections:[],timings:{}}}));
        if(data.type==='detect'){
          this.start??=data.timestampMs;window.fixtureFrames++;
          const person=(x,moving=false)=>{
            const p=Array.from({length:33},(_,i)=>({x:x+(i%2)*.08,y:.2+i*.015,visibility:1}));
            if(moving)p[16].x=p[12].x+.028*Math.cos(Math.PI*(data.timestampMs-this.start)/1300);
            return p;
          };
          const poses=[person(window.fixtureSwap ? .66 : .18),person(window.fixtureSwap ? .18 : .66,true)];
          if(window.fixtureThird)poses.push(person(.42));
          queueMicrotask(()=>this.onmessage?.({data:{type:'result',landmarks:poses,worldLandmarks:[]}}));
        }
      }
      terminate(){}
    }
    window.Worker=FixtureWorker;
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');
      setInterval(()=>{ctx.fillStyle='#c8d8d0';ctx.fillRect(0,0,640,360);ctx.fillStyle='#13231f';ctx.font='22px sans-serif';ctx.fillText('Multi-person detector fixture',100,180);},33);
      return canvas.captureStream(30);
    };
  });
  await page.goto((process.env.APP_URL||'http://127.0.0.1:8091')+'/tracker.html?exercise=pendulum&target=99');
  const button=page.getByRole('button',{name:'Person 2',exact:true});await button.focus();
  const original=await button.elementHandle(),start=await page.evaluate(()=>window.fixtureFrames);
  await page.waitForFunction(start=>window.fixtureFrames>=start+10,start);
  if(!await original.evaluate(el=>el.isConnected&&document.activeElement===el))throw Error('Person 2 lost keyboard focus during inference');
  await page.evaluate(()=>{window.fixtureThird=true;window.fixtureSwap=true;});
  await page.getByRole('button',{name:'Person 3',exact:true}).waitFor();
  if(!await original.evaluate(el=>el.isConnected&&document.activeElement===el))throw Error('Person 2 lost keyboard focus when another person appeared');
  if(process.env.ARTIFACT_DIR)await page.screenshot({path:process.env.ARTIFACT_DIR+'/V3-person-focus.png',fullPage:true});
  await page.keyboard.press('Enter');await page.locator('#selection').waitFor({state:'hidden'});
  await page.waitForFunction(()=>/Right arm: [1-9]/.test(document.getElementById('arm-tally').textContent),null,{timeout:10000});
  if(errors.length)throw Error(errors.join('\n'));
  if(process.env.ARTIFACT_DIR)await page.screenshot({path:process.env.ARTIFACT_DIR+'/V3-person-selected.png',fullPage:true});
  console.log('PASS Person 2 retains its focused DOM node across inference and person-set changes; Enter selects its latest centroid and the moving right arm counts');
}finally{await browser.close();}
