import { chromium,expect } from '@playwright/test';
const base=process.env.APP_URL||'http://127.0.0.1:8092',browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  expect((await page.goto(`${base}/flash.html`)).status()).toBe(200);
  await page.waitForFunction(()=>customElements.get('esp-web-install-button'));
  const button=page.locator('esp-web-install-button');await expect(button).toHaveAttribute('manifest','/firmware/manifest.json');
  const response=await page.request.get(`${base}/firmware/manifest.json`);expect(response.status()).toBe(200);const manifest=await response.json();
  const part=manifest.builds[0].parts[0],bin=await page.request.get(new URL(part.path,`${base}/firmware/manifest.json`).href);expect(bin.status()).toBe(200);const data=await bin.body();expect(data[0]).toBe(0xe9);expect(data[4096]).toBe(0xe9);expect(part.offset).toBe(0);
  await page.screenshot({path:'/home/ubuntu/work/shots/flash-setup.png',fullPage:true});expect(errors).toEqual([]);
  console.log(`PASS /flash.html 200; local install element registered; manifest 200; merged .bin 200 (${data.length} bytes, offset 0); no runtime errors`);
}finally{await browser.close();}
