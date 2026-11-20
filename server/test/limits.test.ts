import { it, expect,vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from '../src/backend';
it('limits login, registration and pairing to ten attempts per IP per minute',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mc-rate-'));const b=createBackend({dataDir:dir});
  try {
    for(const path of ['/api/auth/login','/api/auth/register','/api/devices/pair']) {
      for(let i=0;i<10;i++)expect((await request(b.app).post(path).send({})).status).not.toBe(429);
      const limited=await request(b.app).post(path).send({});expect(limited.status).toBe(429);expect(limited.headers['retry-after']).toBeTruthy();
    }
  } finally {await b.close();rmSync(dir,{recursive:true});}
});
it('shares throttle buckets across route casing and trailing slashes',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mc-rate-case-')),b=createBackend({dataDir:dir});
  try{
    for(let i=0;i<10;i++)await request(b.app).post('/api/auth/login').send({}).expect(400);
    await request(b.app).post('/API/AUTH/LOGIN/').send({}).expect(429);
    await request(b.app).post('/Api/Auth/Login?retry=1').send({}).expect(429);
  }finally{await b.close();rmSync(dir,{recursive:true});}
});
it('separates forwarded client IPs behind one proxy and allows disabling proxy trust',async()=>{
  for(const trustProxy of [1,0]){
    const dir=mkdtempSync(join(tmpdir(),'mc-rate-proxy-')),b=createBackend({dataDir:dir,trustProxy});
    try{
      for(let i=0;i<10;i++)await request(b.app).post('/api/auth/login').set('X-Forwarded-For','198.51.100.1').send({}).expect(400);
      await request(b.app).post('/api/auth/login').set('X-Forwarded-For','198.51.100.1').send({}).expect(429);
      await request(b.app).post('/api/auth/login').set('X-Forwarded-For','198.51.100.2').send({}).expect(trustProxy?400:429);
    }finally{await b.close();rmSync(dir,{recursive:true});}
  }
});
it('ignores spoofed forwarding headers by default',async()=>{
  vi.stubEnv('TRUST_PROXY',undefined);
  const dir=mkdtempSync(join(tmpdir(),'mc-rate-direct-')),b=createBackend({dataDir:dir});
  try{
    for(let i=0;i<10;i++)await request(b.app).post('/api/auth/login').set('X-Forwarded-For',`198.51.100.${i+1}`).send({}).expect(400);
    await request(b.app).post('/api/auth/login').set('X-Forwarded-For','198.51.100.200').send({}).expect(429);
  }finally{await b.close();rmSync(dir,{recursive:true});vi.unstubAllEnvs();}
});
