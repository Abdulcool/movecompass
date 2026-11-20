import { build } from "esbuild";
import { cp, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(`${root}dist/tracker`, { recursive: true });
await build({
  entryPoints: [`${root}tracker/main.ts`],
  outfile: `${root}dist/tracker/main.js`,
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
});
await copyFile(`${root}tracker/tracker.html`, `${root}dist/tracker.html`);
await copyFile(
  `${root}tracker/assets/pose_landmarker_full.task`,
  `${root}dist/tracker/pose_landmarker_full.task`,
);
await copyFile(`${root}tracker/assets/LICENSE.apache-2.0.txt`, `${root}dist/tracker/LICENSE.apache-2.0.txt`);
await copyFile(`${root}tracker/assets/NOTICE.md`, `${root}dist/tracker/NOTICE.md`);
await cp(
  fileURLToPath(
    new URL("../../node_modules/@mediapipe/tasks-vision/wasm", import.meta.url),
  ),
  `${root}dist/tracker/wasm`,
  { recursive: true },
);
console.log(
  "Tracker built: dist/tracker.html + local JS, WASM and full pose model",
);
