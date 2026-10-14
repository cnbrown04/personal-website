import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const GRID = 110; // columns per side
const SPACING = 0.5;
const MAX_RIPPLES = 8;

interface Ripple {
  x: number;
  z: number;
  born: number;
}

/** Mounts the scene into `host`. Returns a cleanup function. */
export function createScene(host: HTMLElement): () => void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timeScale = reducedMotion ? 0.3 : 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b10);
  scene.fog = new THREE.Fog(0x0b0b10, 45, 110);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 26, 44);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.minDistance = 12;
  controls.maxDistance = 110;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.35;

  scene.add(new THREE.HemisphereLight(0xb8c6ff, 0x120c18, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 40, 12);
  scene.add(sun);

  // One instanced mesh for every column. The geometry sits on y=0 so scaling
  // y grows the column upward from its base.
  const geometry = new THREE.BoxGeometry(SPACING * 0.84, 1, SPACING * 0.84);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 });
  const count = GRID * GRID;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const xs = new Float32Array(count);
  const zs = new Float32Array(count);
  const half = ((GRID - 1) * SPACING) / 2;
  for (let i = 0; i < count; i++) {
    xs[i] = (i % GRID) * SPACING - half;
    zs[i] = Math.floor(i / GRID) * SPACING - half;
  }

  // Pointer → point on the ground plane, for the hover bump and ripples.
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let hover: { x: number; z: number } | null = null;
  const ripples: Ripple[] = [];
  let downAt: { x: number; y: number } | null = null;

  function groundPoint(e: PointerEvent) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(ground, hit) ? { x: hit.x, z: hit.z } : null;
  }
  function onMove(e: PointerEvent) {
    hover = groundPoint(e);
  }
  function onDown(e: PointerEvent) {
    downAt = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: PointerEvent) {
    // Treat as a click (ripple) only if the pointer barely moved; otherwise it was an orbit drag.
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
    const p = groundPoint(e);
    if (!p) return;
    ripples.push({ ...p, born: elapsed });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
  }
  function onLeave() {
    hover = null;
  }
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  const canvas = renderer.domElement;
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  window.addEventListener("resize", onResize);

  const color = new THREE.Color();
  const timer = new THREE.Timer();
  let elapsed = 0;
  let frame = 0;

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    timer.update(now);
    elapsed += Math.min(timer.getDelta(), 0.05) * timeScale;
    const t = elapsed;

    const matrices = mesh.instanceMatrix.array as Float32Array;
    const colors = (mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;

    for (let i = 0; i < count; i++) {
      const x = xs[i];
      const z = zs[i];
      const d = Math.sqrt(x * x + z * z);

      let h =
        Math.sin(d * 0.35 - t * 1.2) * 1.1 +
        Math.sin(x * 0.22 + t * 0.7) * Math.cos(z * 0.2 - t * 0.5) * 0.9;

      if (hover) {
        const dx = x - hover.x;
        const dz = z - hover.z;
        h += 2.2 * Math.exp(-(dx * dx + dz * dz) / 12);
      }

      for (const r of ripples) {
        const age = t - r.born;
        const dx = x - r.x;
        const dz = z - r.z;
        const front = Math.sqrt(dx * dx + dz * dz) - age * 11;
        h += 3.2 * Math.exp(-(front * front) / 6) * Math.exp(-age * 0.55);
      }

      const height = Math.max(0.08, h + 3.2);
      const o = i * 16;
      // Column-major scale + translation, written straight into the buffer.
      matrices[o] = 1;
      matrices[o + 5] = height;
      matrices[o + 10] = 1;
      matrices[o + 12] = x;
      matrices[o + 14] = z;
      matrices[o + 15] = 1;

      const n = Math.min(1, Math.max(0, (h + 3) / 9));
      color.setHSL(0.66 - n * 0.58, 0.8, 0.28 + n * 0.32);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    while (ripples.length && t - ripples[0].born > 8) ripples.shift();

    mesh.instanceMatrix.needsUpdate = true;
    (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    controls.update();
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
