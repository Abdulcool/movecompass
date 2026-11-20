import {it,expect} from 'vitest';
import request from 'supertest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBackend} from '../src/backend';
it.each([true,false])('reports the configured ephemeral flag: %s',async ephemeral=>{
  const dir=mkdtempSync(join(tmpdir(),'mc-config-')),b=createBackend({dataDir:dir,ephemeral});
  try{expect((await request(b.app).get('/healthz').expect(200)).body).toEqual({ok:true,ephemeral});}finally{await b.close();rmSync(dir,{recursive:true});}
});
