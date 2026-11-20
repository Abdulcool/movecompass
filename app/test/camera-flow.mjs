import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const file=process.argv[2];if(!file)throw new Error('Pass a fake-camera Y4M with six full squat repetitions.');
const base=process.env.APP_URL||'http://127.0.0.1:18081';
const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${file}`,'--enable-unsafe-swiftshader']});
try{
  const staff=await browser.newContext(),patient=await browser.newContext({permissions:['camera']});
  const a=await staff.newPage(),p=await patient.newPage();
  const errors=[];for(const page of [a,p])page.on('pageerror',e=>errors.push(e.message));
  async function login(page,email,role){await page.goto(base);if(role==='staff')await page.getByRole('button',{name:'CCCARE staff',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('123');await page.getByRole('button',{name:'Continue',exact:true}).click();}
  await login(a,'staff@cccare.ca','staff');await a.getByText('● Live connection online').waitFor();
  await login(p,'janedoe@gmail.com','patient');await p.getByText('Hello, Jane.').waitFor();await p.goto(`${base}/track?id=sit-to-stand`);
  assert.equal(await p.getByRole('button',{name:'Start live pose tracking',exact:true}).isDisabled(),true);
  assert.equal(await p.locator('iframe').count(),0);
  await p.getByRole('button',{name:'I understand and consent to the tracking prototype',exact:true}).click();await p.getByRole('button',{name:'Start live pose tracking',exact:true}).click();
  const response=await p.waitForResponse(r=>r.url().endsWith('/api/completions')&&r.request().method()==='POST',{timeout:90000});
  assert.equal(response.status(),201);const body=response.request().postDataJSON();assert.equal(body.source,'camera');assert.equal(body.reps,6);assert.ok(body.angles.rightKnee>60);
  await p.getByText('Session saved. Your care team has been notified.').waitFor();await a.getByRole('alert').filter({hasText:'Jane Doe completed Supported sit-to-stand · 6 reps'}).waitFor();
  assert.equal(await p.locator('iframe').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS consent prevents camera iframe creation before approval');console.log('PASS real MediaPipe fake-camera input counts six reps and auto-saves once with source camera and joint ROM');console.log('PASS staff receives the camera completion toast live');console.log('PASS completion unmounts camera iframe; no browser runtime errors');
}finally{await browser.close();}
