import { it,expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from '../src/backend';
it('restores a signed board after a wiped DB without trusting a forged proof or revoked key',async()=>{
  const dirs=[mkdtempSync(join(tmpdir(),'mc-proof-')),mkdtempSync(join(tmpdir(),'mc-reset-'))];
  const make=(dataDir:string)=>createBackend({dataDir,seedDemo:true,devicePairingSecret:'p'.repeat(48),sendPush:async()=>{}});
  let b=make(dirs[0]);
  try {
    const login=async()=> (await request(b.app).post('/api/auth/login').send({email:'staff@cccare.ca',password:'123',role:'staff'})).body.token;
    const staff=await login();
    const d=(await request(b.app).post('/api/devices').auth(staff,{type:'bearer'}).send({name:'Board',patientEmail:'janedoe@gmail.com'})).body;
    const proof=(await request(b.app).post('/api/devices/pair').send({code:d.pairingCode})).body;
    expect(proof.key).toMatch(/^mc1\./);await b.close();b=make(dirs[1]);
    expect((await request(b.app).post('/api/devices/recover').send({...proof,key:proof.key+'x'})).status).toBe(401);
    const recovered=await request(b.app).post('/api/devices/recover').send(proof);
    expect(recovered.status).toBe(200);expect(recovered.body.patientId).not.toBe(proof.patientId);
    const next=(await request(b.app).post(`/api/devices/${d.deviceId}/pair-code`).auth(await login(),{type:'bearer'})).body;
    expect((await request(b.app).post('/api/devices/pair').send({code:next.pairingCode})).status).toBe(200);
    expect((await request(b.app).post('/api/devices/recover').send(proof)).status).toBe(401);
  } finally {await b.close();for(const dir of dirs)rmSync(dir,{recursive:true});}
});
