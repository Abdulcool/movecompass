import { build } from "esbuild";
import { mkdir,copyFile,readFile,writeFile,rename } from "node:fs/promises";
import { createHash } from 'node:crypto';
import { brotliCompressSync,gzipSync } from 'node:zlib';
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(`${root}dist/tracker`, { recursive: true });
const files={
  'pose_landmarker_full.task':`${root}tracker/assets/pose_landmarker_full.task`,
  'vision_wasm_internal.js':`${root}../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js`,
  'vision_wasm_internal.wasm':`${root}../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm`,
};
const buffers=await Promise.all(Object.entries(files).map(async([name,path])=>[name,await readFile(path)]));
const hash=createHash('sha256');for(const [name,buffer]of buffers){hash.update(name);hash.update(buffer);}
const base=`/tracker/assets/${hash.digest('hex').slice(0,16)}`;
const sizes=Object.fromEntries(buffers.map(([name,buffer])=>[name,buffer.length]));
await mkdir(`${root}dist${base}`,{recursive:true});
for(const [name,buffer] of buffers){const path=`${root}dist${base}/${name}`;await writeFile(path,buffer);await writeFile(`${path}.br`,brotliCompressSync(buffer));await writeFile(`${path}.gz`,gzipSync(buffer));}
await build({
  entryPoints: [`${root}tracker/main.ts`],
  outfile: `${root}dist/tracker/main.js`,
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  define:{__TRACKER_ASSETS__:JSON.stringify({base,sizes})},
});
const js=await readFile(`${root}dist/tracker/main.js`),name=`main-${createHash('sha256').update(js).digest('hex').slice(0,16)}.js`;
await rename(`${root}dist/tracker/main.js`,`${root}dist/tracker/${name}`);
await writeFile(`${root}dist/tracker.html`,(await readFile(`${root}tracker/tracker.html`,'utf8')).replace('/tracker/main.js',`/tracker/${name}`));
await writeFile(`${root}dist/tracker/asset-manifest.json`,JSON.stringify({base,sizes}));
await copyFile(`${root}tracker/assets/LICENSE.apache-2.0.txt`, `${root}dist/tracker/LICENSE.apache-2.0.txt`);
await copyFile(`${root}tracker/assets/NOTICE.md`, `${root}dist/tracker/NOTICE.md`);
console.log(
  `Tracker built: full model + one classic WASM variant; ${Object.values(sizes).reduce((a,b)=>a+b,0)} decoded asset bytes; content-hashed, gzip/Brotli ready`,
);
