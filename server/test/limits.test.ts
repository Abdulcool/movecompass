import { it, expect } from 'vitest';
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
