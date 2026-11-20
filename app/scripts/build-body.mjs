import { build } from "esbuild";
import { mkdir, copyFile, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(`${root}dist/body`, { recursive: true });
await build({ entryPoints: [`${root}body/main.tsx`], outfile: `${root}dist/body/main.js`, bundle: true, format: "esm", target: "es2022", minify: true, define: { "process.env.NODE_ENV": '"production"' } });
await copyFile(`${root}body/body.html`, `${root}dist/body.html`);
await cp(`${root}body/assets`, `${root}dist/body`, { recursive: true });
console.log("Body built: dist/body.html + local R3F scene and human GLB");
