import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Mesh, MeshPhysicalMaterial, Raycaster, Vector2, Vector3, type BufferGeometry } from "three";
import { regionAt, regionNumber, regionShader, type BodyPickerProps } from "./regions";
declare global { interface Window { __MOVE_BODY_TEST__?: { ready?: boolean; project?: (target: number[]) => { x: number; y: number; point: number[] }; camera?: () => { position: number[]; projection: number[]; world: number[] } } } }

function Human({ value, onChange, onHover, onReady }: BodyPickerProps & { onHover: (id: string) => void; onReady:()=>void }) {
  const gltf = useLoader(GLTFLoader, "/body/human.glb");
  const [hover, setHover] = useState("");
  const mesh = useRef<Mesh>(null), get = useThree(s => s.get);
  useEffect(() => {
    onReady();
    const hook = window.__MOVE_BODY_TEST__;
    if (!hook) return;
    hook.ready = true;
    hook.project = target => {
      const object = mesh.current!, { camera, gl } = get(), rect = gl.domElement.getBoundingClientRect();
      object.updateWorldMatrix(true, false); camera.updateMatrixWorld();
      const positions = geometry.attributes.position, indices = geometry.index!, goal = new Vector3().fromArray(target);
      const candidates: Vector3[] = [];
      for (let i = 0; i < indices.count; i += 3) {
        const point = new Vector3();
        for (let j = 0; j < 3; j++) point.add(new Vector3().fromBufferAttribute(positions, indices.getX(i + j)));
        candidates.push(point.divideScalar(3).applyMatrix4(object.matrixWorld));
      }
      candidates.sort((a, b) => a.distanceToSquared(goal) - b.distanceToSquared(goal));
      const ray = new Raycaster();
      for (const point of candidates.slice(0, 200)) {
        const projected = point.clone().project(camera);
        const x = Math.round(rect.left + (projected.x + 1) * rect.width / 2), y = Math.round(rect.top + (1 - projected.y) * rect.height / 2);
        ray.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
        const hit = ray.intersectObject(object, false)[0];
        if (hit && hit.point.distanceTo(point) < .015) return { x, y, point: hit.point.toArray() };
      }
      throw new Error("No visible surface near body test anchor");
    };
    return () => { delete hook.ready; delete hook.project; };
  }, [gltf]);
  const geometry = useMemo(() => {
    let result: BufferGeometry | undefined;
    gltf.scene.traverse(object => { if (object instanceof Mesh) result = object.geometry; });
    if (!result) throw new Error("Human mesh is missing");
    return result;
  }, [gltf]);
  const uniforms = useMemo(() => ({ selected: { value: 0 }, hovered: { value: 0 } }), []);
  const material = useMemo(() => {
    const skin = new MeshPhysicalMaterial({ color: "#D8B69B", roughness: .64, metalness: 0, clearcoat: .08 });
    skin.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 bodyPoint;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nbodyPoint = position;");
      shader.fragmentShader = `varying vec3 bodyPoint; uniform float selected; uniform float hovered;\n${regionShader}\n${shader.fragmentShader}`
        .replace("#include <color_fragment>", `#include <color_fragment>
          float region = bodyRegion(bodyPoint);
          float selectionMask = selected > 0.0 && abs(region - selected) < .1 ? 1.0 : 0.0;
          float hoverMask = hovered > 0.0 && abs(region - hovered) < .1 ? 1.0 : 0.0;
          if (bodyPoint.y > .96 && bodyPoint.y < 1.14) diffuseColor.rgb *= vec3(.38, .46, .43);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.026, .181, .102), max(selectionMask * .8, hoverMask * .45));`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.03, .12, .07) * selectionMask;");
    };
    return skin;
  }, [uniforms]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => { uniforms.selected.value = regionNumber(value); uniforms.hovered.value = regionNumber(hover); });
  function hit(e: ThreeEvent<PointerEvent | MouseEvent>) {
    return regionAt(e.object.worldToLocal(e.point.clone()));
  }
  return <mesh ref={mesh} geometry={geometry} material={material} castShadow receiveShadow
    onClick={e => { if (e.delta > 5) return; const id = hit(e); if (id) { e.stopPropagation(); onChange(id); } }}
    onPointerMove={e => { const id = hit(e) ?? ""; setHover(id); onHover(id); }}
    onPointerOut={() => { setHover(""); onHover(""); }} />;
}
function Controls({ touched }: { touched: React.RefObject<boolean> }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const hook = window.__MOVE_BODY_TEST__;
    if (!hook) return;
    hook.camera = () => { camera.updateMatrixWorld(); return { position: camera.position.toArray(), projection: camera.projectionMatrix.toArray(), world: camera.matrixWorld.toArray() }; };
    return () => { delete hook.camera; };
  }, [camera, gl]);
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(0, 1, 0); c.enablePan = false; c.enableDamping = true; c.dampingFactor = .12;
    c.minDistance = 2.6; c.maxDistance = 5.5;
    c.minPolarAngle = Math.PI * .34; c.maxPolarAngle = Math.PI * .64;
    c.rotateSpeed = .6; c.zoomSpeed = .7; c.update();
    return c;
  }, [camera, gl]);
  useEffect(() => {
    const stop = () => { touched.current = true; invalidate(); };
    controls.addEventListener("start", stop);
    return () => { controls.removeEventListener("start", stop); controls.dispose(); };
  }, [controls, touched, invalidate]);
  useFrame((_, delta) => { controls.autoRotate = !touched.current; controls.autoRotateSpeed = .35; controls.update(delta); });
  return null;
}
class SceneBoundary extends Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="status">3D view unavailable. Choose a body area below.</p> : this.props.children; }
}
function Unavailable({done}:{done:()=>void}) {useEffect(done,[]);return <p>3D view unavailable. Choose a body area below.</p>;}
export function BodyScene(props: BodyPickerProps & {onReady?:()=>void}) {
  const touched = useRef(false), [hover, setHover] = useState(""),[loaded,setLoaded]=useState(false);
  const ready=()=>{setLoaded(true);props.onReady?.();};
  return <SceneBoundary><div aria-label="Interactive 3D body. Drag to rotate; scroll or pinch to zoom. Use body area buttons below as an alternative."
    onPointerDown={() => { touched.current = true; }} onWheel={() => { touched.current = true; }}
    style={{ position:'relative',height: 460, width: "100%", background: "#EEF0E9", borderRadius: 16, overflow: "hidden", cursor: hover ? "pointer" : "grab", touchAction: "none" }}>
    <style>{'@keyframes movecompass-spin{to{transform:rotate(360deg)}}'}</style>
    {!loaded && <div role="status" style={{position:'absolute',inset:0,zIndex:2,display:'flex',alignItems:'center',justifyContent:'center',gap:12,background:'#EEF0E9'}}><span aria-hidden="true" style={{width:24,height:24,border:'3px solid #AABBB0',borderTopColor:'#2D765A',borderRadius:'50%',animation:'movecompass-spin 1s linear infinite'}}/>Loading 3D body…</div>}
    <Canvas shadows camera={{ position: [0, 1.15, 3.6], fov: 38 }} dpr={[1, 1.75]}
      gl={{ antialias: true }} fallback={<Unavailable done={ready}/>}>
      <color attach="background" args={["#EEF0E9"]} />
      <hemisphereLight args={["#ffffff", "#8B9B85", 2.1]} />
      <directionalLight position={[3, 5, 4]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-normalBias={.02}
        shadow-camera-left={-1.8} shadow-camera-right={1.8} shadow-camera-top={2.8} shadow-camera-bottom={-1} />
      <directionalLight position={[-3, 2, -3]} intensity={2} color="#DFECE4" />
      <Suspense fallback={null}><Human {...props} onHover={setHover} onReady={ready} /></Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial opacity={.16} /></mesh>
      <Controls touched={touched} />
    </Canvas>
  </div></SceneBoundary>;
}
