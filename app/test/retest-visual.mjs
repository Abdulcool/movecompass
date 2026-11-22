import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.APP_URL||'http://127.0.0.1:8091',shots=process.env.SHOTS_DIR||'/home/ubuntu/work/accuracy2/retest-shots';
await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
async function screen(page,name){
  assert.equal(await page.locator('h1').count(),1,name+' has one h1');
  assert.equal(await page.getByRole('main').count(),1,name+' has one main');
  await page.screenshot({path:shots+'/'+name+'.png',fullPage:false});
}
async function login(page,email,staff=false){
  await page.goto(base);if(staff)await page.getByRole('button',{name:'CCCARE staff',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('123');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
}
try{
  const p=await browser.newPage({viewport:{width:640,height:1000}}),a=await browser.newPage({viewport:{width:640,height:1000}});
  for(const page of[p,a]){page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.zoom='2'));}
  await p.goto(base);await p.getByRole('button',{name:'Continue',exact:true}).waitFor();await screen(p,'login-200');
  await login(p,'janedoe@gmail.com');await p.getByRole('heading',{name:'Hello, Jane.',exact:true}).waitFor();await screen(p,'home-200');
  await p.goto(base+'/track?id=wall-angels');await p.getByText('Before camera tracking',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Complete manually without camera',exact:true}).click();
  await p.getByRole('button',{name:'Save 8 reps manually',exact:true}).click();
  const next=p.getByRole('button',{name:'Start next set',exact:true});await next.waitFor();await next.focus();
  await p.getByRole('heading',{name:'8 / 8 reps',exact:true}).waitFor();
  const toast=p.getByRole('alert').filter({hasText:'Dismiss current update'});await toast.waitFor();
  const [t,n]=await Promise.all([toast.boundingBox(),next.boundingBox()]);
  assert.ok(t&&n&&!(t.x<n.x+n.width&&t.x+t.width>n.x&&t.y<n.y+n.height&&t.y+t.height>n.y),'toast does not cover focused Start next set');
  await screen(p,'manual-saved-focused-next-200');
  await login(a,'staff@cccare.ca',true);await a.getByText('● Live connection online',{exact:true}).waitFor();await screen(a,'staff-200');
  assert.deepEqual(errors,[]);console.log('PASS 200% / 320px-content login, Home, staff and manual saved views; one h1/main each; saved count 8/8; toast does not cover focused Start next set; no runtime errors');
  console.log('Screenshots: '+shots);
}finally{await browser.close();}
