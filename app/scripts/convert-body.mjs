import { readFile } from "node:fs/promises";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: convert-body.mjs base.obj human.glb");
const vertices = [], indices = [];
let group = "";
for (const line of (await readFile(input, "utf8")).split("\n")) {
  const [kind, ...values] = line.trim().split(/\s+/);
  if (kind === "v") vertices.push(...values.map(Number));
  if (kind === "g") group = values[0];
  if (kind === "f" && group === "body") {
    const face = values.map(v => Number(v.split("/")[0]) - 1);
    for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
  }
}
if (!indices.length) throw new Error("No body faces found");
const source = new BufferGeometry();
source.setAttribute("position", new Float32BufferAttribute(vertices, 3));
source.setIndex(indices);
const geometry = mergeVertices(source.toNonIndexed());
geometry.computeBoundingBox();
const { min, max } = geometry.boundingBox;
geometry.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
geometry.scale(...Array(3).fill(2 / (max.y - min.y)));
geometry.computeVertexNormals();
const doc = new Document(), buffer = doc.createBuffer();
const attr = (name, type, array) => doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
const primitive = doc.createPrimitive()
  .setAttribute("POSITION", attr("position", "VEC3", new Float32Array(geometry.attributes.position.array)))
  .setAttribute("NORMAL", attr("normal", "VEC3", new Float32Array(geometry.attributes.normal.array)))
  .setIndices(attr("indices", "SCALAR", new Uint16Array(geometry.index.array)))
  .setMaterial(doc.createMaterial("Neutral skin").setBaseColorFactor([.68, .46, .33, 1]).setMetallicFactor(0).setRoughnessFactor(.65));
doc.createScene().addChild(doc.createNode("MakeHuman CC0 human").setMesh(doc.createMesh().addPrimitive(primitive)));
await new NodeIO().write(output, doc);
console.log(`Body GLB: ${geometry.attributes.position.count} vertices, ${geometry.index.count / 3} triangles, height 2`);
