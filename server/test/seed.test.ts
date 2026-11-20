import { it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcrypt';
import { createBackend } from '../src/backend';
afterEach(()=>vi.unstubAllEnvs());
it('does not seed weak public accounts unless explicitly enabled', async()=>{
  vi.stubEnv('SEED_DEMO','');vi.stubEnv('DEMO_PATIENT_PASSWORD','');vi.stubEnv('DEMO_STAFF_PASSWORD','');
  const dir=mkdtempSync(join(tmpdir(),'mc-seed-'));
  let b=createBackend({dataDir:dir});
  expect((b.db.prepare('SELECT count(*) n FROM users').get() as any).n).toBe(0);
  await b.close();vi.stubEnv('SEED_DEMO','1');b=createBackend({dataDir:dir});
  expect((b.db.prepare('SELECT count(*) n FROM users').get() as any).n).toBe(2);await b.close();
  vi.stubEnv('SEED_DEMO','');vi.stubEnv('DEMO_PATIENT_PASSWORD','random-patient-password');vi.stubEnv('DEMO_STAFF_PASSWORD','random-staff-password');
  b=createBackend({dataDir:dir});
  for(const u of b.db.prepare('SELECT role,password_hash FROM users').all() as any[]) {
    expect(bcrypt.compareSync('123',u.password_hash)).toBe(false);
    expect(bcrypt.compareSync(u.role==='staff'?'random-staff-password':'random-patient-password',u.password_hash)).toBe(true);
  }
  await b.close();rmSync(dir,{recursive:true});
});
