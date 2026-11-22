import { chromium,expect } from '@playwright/test';
const base=process.env.APP_URL||'http://127.0.0.1:8092';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:430,height:932}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByLabel('Email',{exact:true}).fill('janedoe@gmail.com');await page.getByLabel('Password',{exact:true}).fill('123');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByText('Hello, Jane.')).toBeVisible();
  const token=await page.evaluate(()=>localStorage.getItem('mc-token'));
  await page.getByRole('tab',{name:/Profile/}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  expect((await page.request.get(`${base}/api/me`,{headers:{Authorization:`Bearer ${token}`}})).status()).toBe(401);
  expect(errors).toEqual([]);
  console.log('PASS clean-profile sign out returns to login, survives reload, and revokes JWT; no blank screen or runtime errors');
} finally {await browser.close();}
