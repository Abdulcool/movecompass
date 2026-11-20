import { readdir,readFile,writeFile } from 'node:fs/promises';
import { brotliCompressSync,gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('../dist/_expo/static/js/web/',import.meta.url));
let raw=0,compressed=0;
for(const file of await readdir(dir)){if(!file.endsWith('.js'))continue;const data=await readFile(dir+file),br=brotliCompressSync(data);raw+=data.length;compressed+=br.length;await writeFile(dir+file+'.br',br);await writeFile(dir+file+'.gz',gzipSync(data));if(file.startsWith('entry-'))console.log(`Login entry: ${data.length} raw bytes; ${br.length} Brotli bytes`);}
console.log(`Web JS precompressed: ${raw} raw → ${compressed} Brotli bytes`);
