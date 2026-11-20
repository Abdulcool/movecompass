import { build } from 'esbuild';
import { mkdir,copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(`${root}dist/esp-web-tools`,{recursive:true});
await build({entryPoints:[`${root}../node_modules/esp-web-tools/dist/install-button.js`],outdir:`${root}dist/esp-web-tools`,bundle:true,splitting:true,format:'esm',target:'es2022',minify:true,chunkNames:'chunks/[name]-[hash]'});
await copyFile(`${root}../node_modules/esp-web-tools/LICENSE`,`${root}dist/esp-web-tools/LICENSE`);
console.log('Flasher built: local ESP Web Tools, manifest and merged ESP8266 image');
