# Third-party assets

## Interactive human body

- **MakeHuman hm08 human base mesh**, MakeHuman Community.
- Source: https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj
- **CC0 1.0 Universal**. The source OBJ explicitly records its September 2020 CC0 release. Copyright holders at release: Data Collection AB, Joel Palmius, Jonas Hauquier. https://creativecommons.org/publicdomain/zero/1.0/
- Bundled license: `app/body/assets/CC0-1.0.txt` (also served at `/body/CC0-1.0.txt`).
- Local derivative: `app/body/assets/human.glb`. Only the anatomical `body` group is retained; MakeHuman rig/helper cages are omitted. Quads are triangulated, duplicate vertices merged, normals smoothed, and the human is centered and normalized to height 2. No external textures or model requests are needed.
- Reproduce: download that pinned OBJ, then run `node app/scripts/convert-body.mjs /path/to/base.obj app/body/assets/human.glb` from the repository root (Node 22).
- Neutral skin, studio lighting, and a modesty band are rendered in the shared scene. Region bands are selection aids, not anatomical segmentation or diagnosis. “Upper back” uses the upper central torso band, visible from either side for accessibility.

## Camera tracker

The MediaPipe full pose model and runtime notices are in `app/tracker/assets/NOTICE.md`; licensed test video sources and authors are in `app/tracker/ACCURACY.md`.
