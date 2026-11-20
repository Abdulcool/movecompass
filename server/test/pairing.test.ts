import { it,expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from '../src/backend';
it('pairs once with a six-digit expiring code, rotates the key, rejects empty, reused and expired codes',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mc-pair-')),b=createBackend({dataDir:dir,seedDemo:true});
  try {
    const staff=(await request(b.app).post('/api/auth/login').send({email:'staff@cccare.ca',password:'123',role:'staff'})).body.token;
    const device=(await request(b.app).post('/api/devices').auth(staff,{type:'bearer'}).send({name:'Kitchen',patientEmail:'janedoe@gmail.com'})).body;
    expect(device.pairingCode).toMatch(/^\d{6}$/);expect(Date.parse(device.pairingExpiresAt)-Date.now()).toBeGreaterThan(14*60000);
    await request(b.app).post('/api/devices/pair').send({}).expect(400);
    const paired=await request(b.app).post('/api/devices/pair').send({code:device.pairingCode}).expect(200);
    expect(paired.body.deviceId).toBe(device.deviceId);expect(paired.body.patientId).toBeTruthy();expect(paired.body.key).not.toBe(device.deviceKey);
    await request(b.app).post('/api/devices/pair').send({code:device.pairingCode}).expect(400);
    const next=(await request(b.app).post(`/api/devices/${device.deviceId}/pair-code`).auth(staff,{type:'bearer'}).send({})).body;
    b.db.prepare('UPDATE pairing_codes SET expires = 0').run();
    await request(b.app).post('/api/devices/pair').send({code:next.pairingCode}).expect(400);
  } finally {await b.close();rmSync(dir,{recursive:true});}
});
