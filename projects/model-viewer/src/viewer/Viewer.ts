import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { WebGPURenderer } from "three/webgpu";
import type { MeshData } from "../../wasm/pkg/model_viewer.js";

export interface ViewOptions {
  wireframe: boolean;
  edges: boolean;
  grid: boolean;
  autoRotate: boolean;
  orthographic: boolean;
  explode: number;
  hiddenMaterials: number[];
}

export const defaultViewOptions: ViewOptions = {
  wireframe: false,
  edges: true,
  grid: true,
  autoRotate: false,
  orthographic: false,
  explode: 0,
  hiddenMaterials: [],
};

/**
 * A small three.js scene tuned for CAD: Z-up like OpenSCAD, a build-plate grid
 * in millimetres, and per-material submeshes so parts can be hidden or pulled
 * apart.
 */
export class Viewer {
  // WebGPU where the browser has it, WebGL 2 otherwise (three.js picks).
  private renderer: WebGPURenderer;
  /** WebGPURenderer initializes asynchronously; frames before that are skipped. */
  private ready = false;
  /** Resolves once the GPU backend is up and frames are being drawn. */
  readonly initialized: Promise<void>;
  private scene = new THREE.Scene();
  private perspective: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.Camera;
  readonly controls: OrbitControls;
  readonly root = new THREE.Group();
  private grid = new THREE.Group();
  private parts: {
    material: number;
    mesh: THREE.Mesh;
    edges: THREE.LineSegments;
    center: THREE.Vector3;
  }[] = [];
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private options: ViewOptions = { ...defaultViewOptions };
  private modelSize = new THREE.Vector3(100, 100, 50);
  private modelCenter = new THREE.Vector3();

  readonly canvas: HTMLCanvasElement;
  private frameListeners = new Set<() => void>();
  /** Material slots hidden by tools (e.g. while a layout preview replaces them). */
  private forcedHidden = new Set<number>();
  private palette: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGPURenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color("#12151c");

    this.perspective = new THREE.PerspectiveCamera(38, 1, 0.5, 6000);
    this.ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, -5000, 5000);
    for (const cam of [this.perspective, this.ortho]) cam.up.set(0, 0, 1);
    this.camera = this.perspective;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotateSpeed = 1.4;

    this.buildLights();
    this.buildGrid();
    this.scene.add(this.root);

    // The canvas shares a CSS grid with the panel, so track its box directly
    // rather than only reacting to window resizes.
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.initialized = this.renderer.init().then(() => {
      if (!this.disposed) this.ready = true;
    });
    this.tick();
  }

  /** Which GPU API is drawing the scene. */
  get backend(): "WebGPU" | "WebGL 2" {
    return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
      ? "WebGPU"
      : "WebGL 2";
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20242c, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(120, -160, 220);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.8);
    fill.position.set(-180, 120, 60);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0, 200, -120);
    this.scene.add(rim);
  }

  private buildGrid() {
    const size = 400;
    const minor = new THREE.GridHelper(size, size / 5, 0x2c3340, 0x232935);
    const major = new THREE.GridHelper(size, size / 50, 0x3d4757, 0x3d4757);
    for (const g of [minor, major]) {
      g.rotation.x = Math.PI / 2; // GridHelper is XZ; OpenSCAD works in XY
      (g.material as THREE.Material).transparent = true;
      (g.material as THREE.Material).opacity = 0.55;
      this.grid.add(g);
    }
    const axes = new THREE.AxesHelper(30);
    (axes.material as THREE.Material).depthTest = false;
    this.grid.add(axes);
    this.scene.add(this.grid);
  }

  setOptions(options: ViewOptions) {
    const previous = this.options;
    this.options = options;
    this.grid.visible = options.grid;
    this.meshMaterial.wireframe = options.wireframe;
    this.controls.autoRotate = options.autoRotate;
    if (options.orthographic !== previous.orthographic) this.useCamera(options.orthographic);
    for (const part of this.parts) {
      const hidden =
        options.hiddenMaterials.includes(part.material) || this.forcedHidden.has(part.material);
      part.mesh.visible = !hidden;
      part.edges.visible = !hidden && options.edges && !options.wireframe;
      this.applyExplode(part, options.explode);
    }
  }

  private applyExplode(
    part: { mesh: THREE.Mesh; edges: THREE.LineSegments; center: THREE.Vector3 },
    amount: number,
  ) {
    const dir = part.center.clone().sub(this.modelCenter);
    dir.z = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 0);
    else dir.normalize();
    const offset = dir.multiplyScalar(amount * Math.max(this.modelSize.x, this.modelSize.y) * 0.5);
    part.mesh.position.copy(offset);
    part.edges.position.copy(offset);
  }

  private useCamera(orthographic: boolean) {
    const target = this.controls.target.clone();
    const position = this.camera.position.clone();
    this.camera = orthographic ? this.ortho : this.perspective;
    this.camera.position.copy(position);
    this.controls.object = this.camera;
    this.controls.target.copy(target);
    this.resize();
    this.controls.update();
  }

  // Shared by every part and every render: new materials would force three.js
  // to compile fresh shader programs each time a mesh arrives.
  private meshMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.05,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  private edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x0d1016,
    transparent: true,
    opacity: 0.45,
  });

  /** Replace the displayed geometry. Old buffers are released immediately. */
  setMesh(data: MeshData) {
    this.clearParts();

    // One copy out of wasm each; parts below are zero-copy views into these.
    const positions = data.positions;
    const normals = data.normals;
    const colors = data.colors;
    const ranges = data.ranges;
    const edges = data.edges;
    const edgeRanges = data.edge_ranges;
    const palette = data.palette as string[];
    const bbox = data.bbox;
    this.palette = palette.map((c) => c.toLowerCase());

    const min = new THREE.Vector3(bbox[0], bbox[1], bbox[2]);
    const max = new THREE.Vector3(bbox[3], bbox[4], bbox[5]);
    this.modelSize = max.clone().sub(min);
    this.modelCenter = min.clone().add(max).multiplyScalar(0.5);

    const edgeBySlot = new Map<number, [number, number]>();
    for (let i = 0; i < edgeRanges.length; i += 3)
      edgeBySlot.set(edgeRanges[i], [edgeRanges[i + 1], edgeRanges[i + 2]]);

    for (let i = 0; i < ranges.length; i += 3) {
      const slot = ranges[i];
      const start = ranges[i + 1] * 3;
      const end = start + ranges[i + 2] * 3;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions.subarray(start, end), 3),
      );
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals.subarray(start, end), 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors.subarray(start, end), 3));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.meshMaterial);

      const edgeGeometry = new THREE.BufferGeometry();
      const er = edgeBySlot.get(slot);
      if (er)
        edgeGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(edges.subarray(er[0] * 3, (er[0] + er[1]) * 3), 3),
        );
      const lines = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);

      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      this.root.add(mesh, lines);
      this.parts.push({ material: slot, mesh, edges: lines, center });
    }

    // Sit the model on the build plate and re-centre it on X/Y.
    this.root.position.set(-this.modelCenter.x, -this.modelCenter.y, -min.z);
    this.setOptions(this.options);
  }

  private clearParts() {
    for (const part of this.parts) {
      part.mesh.geometry.dispose();
      part.edges.geometry.dispose();
      this.root.remove(part.mesh, part.edges);
    }
    this.parts = [];
  }

  get activeCamera(): THREE.Camera {
    return this.camera;
  }

  /** Called every frame after the controls update, before rendering. */
  onFrame(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Palette slot for a `#rrggbb` colour in the current mesh, if present. */
  slotForColor(hex: string): number | undefined {
    const i = this.palette.indexOf(hex.toLowerCase());
    return i < 0 ? undefined : i;
  }

  setForcedHidden(slots: number[]) {
    const next = new Set(slots);
    if (next.size === this.forcedHidden.size && [...next].every((s) => this.forcedHidden.has(s)))
      return;
    this.forcedHidden = next;
    this.setOptions(this.options);
  }

  /** Model-space point to canvas pixel coordinates (null when behind the camera). */
  project(local: THREE.Vector3): { x: number; y: number } | null {
    const world = this.root.localToWorld(local.clone());
    const ndc = world.project(this.camera);
    if (ndc.z > 1 || ndc.z < -1) return null;
    return {
      x: ((ndc.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - ndc.y) / 2) * this.canvas.clientHeight,
    };
  }

  /** Ray through a canvas pixel, expressed in model space. */
  rayAt(clientX: number, clientY: number): THREE.Ray {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const caster = new THREE.Raycaster();
    caster.setFromCamera(ndc, this.camera);
    const inverse = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    return caster.ray.clone().applyMatrix4(inverse);
  }

  /** Aim the camera at a model-space box, looking mostly down onto it. */
  focusBox(min: THREE.Vector3, max: THREE.Vector3) {
    const center = this.root.localToWorld(min.clone().add(max).multiplyScalar(0.5));
    const radius = Math.max(max.clone().sub(min).length() * 0.5, 10);
    const distance = radius / Math.sin((this.perspective.fov * Math.PI) / 360) + radius * 0.4;
    const dir = new THREE.Vector3(0, -0.55, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    if (this.camera === this.ortho) this.fitOrtho(radius);
    this.camera.lookAt(center);
    this.controls.update();
  }

  /** Frame the model, optionally from a named direction. */
  fit(view: "iso" | "front" | "back" | "left" | "right" | "top" | "bottom" = "iso") {
    const radius = Math.max(this.modelSize.length() * 0.5, 10);
    const dirs: Record<string, THREE.Vector3> = {
      iso: new THREE.Vector3(0.9, -1.25, 0.85),
      front: new THREE.Vector3(0, -1, 0),
      back: new THREE.Vector3(0, 1, 0),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 0, 1),
      bottom: new THREE.Vector3(0, 0, -1),
    };
    const dir = dirs[view].clone().normalize();
    const distance = radius / Math.sin((this.perspective.fov * Math.PI) / 360) + radius;
    const target = new THREE.Vector3(0, 0, this.modelSize.z * 0.5);
    this.controls.target.copy(target);
    this.camera.position.copy(target.clone().add(dir.multiplyScalar(distance)));
    if (this.camera === this.ortho) this.fitOrtho(radius);
    this.camera.lookAt(target);
    this.controls.update();
  }

  private fitOrtho(radius: number) {
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1);
    const half = radius * 1.2;
    this.ortho.left = -half * aspect;
    this.ortho.right = half * aspect;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }

  private resize = () => {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    this.fitOrtho(Math.max(this.modelSize.length() * 0.5, 10));
  };

  private tick = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    this.controls.update();
    this.root.updateMatrixWorld();
    for (const listener of this.frameListeners) listener();
    if (this.ready) this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.resize);
    this.clearParts();
    this.meshMaterial.dispose();
    this.edgeMaterial.dispose();
    this.controls.dispose();
    void this.renderer.dispose();
  }
}
