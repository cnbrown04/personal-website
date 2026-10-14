import * as THREE from "three";
import {
  type Fill,
  fillFor,
  footprint,
  laidBounds,
  type Tool,
  type ToolMesh,
} from "../layout/inserts";
import * as L from "../layout/model";
import type { EditPatch } from "../layout/useLayoutHistory";
import type { Viewer } from "./Viewer";

/** Where the model's divider grids sit, echoed by the .scad as MV_LAYOUT=… */
export interface LayoutFrame {
  w: number;
  d: number;
  h: number;
  base: THREE.Vector3;
  lidD: number;
  lidH: number;
  lid: THREE.Vector3;
  wallT: number;
  dividerColor: string;
  insertColor: string | null;
}

export function parseLayoutFrame(log: string): LayoutFrame | null {
  const m = /MV_LAYOUT=([^"\s]+)/.exec(log);
  if (!m) return null;
  const parts = m[1].split(",");
  if (parts.length < 13) return null;
  const n = parts.slice(0, 12).map(Number);
  if (n.some((v) => !Number.isFinite(v))) return null;
  return {
    w: n[0],
    d: n[1],
    h: n[2],
    base: new THREE.Vector3(n[3], n[4], n[5]),
    lidD: n[6],
    lidH: n[7],
    lid: new THREE.Vector3(n[8], n[9], n[10]),
    wallT: n[11],
    dividerColor: parts[12],
    insertColor: parts[13] ?? null,
  };
}

export type ToolMode = "select" | "split-x" | "split-y";

export type ToolSelection =
  | { kind: "regions"; ids: number[] }
  | { kind: "wall"; axis: L.Axis; line: number; a: number; b: number }
  | { kind: "tool"; index: number }
  | null;

export interface ToolState {
  layout: L.Layout;
  /** Layout baked into the mesh currently on screen (null before the first render). */
  rendered: L.Layout | null;
  lidDividers: boolean;
  mode: ToolMode;
  snap: number;
  selection: ToolSelection;
  fills: Fill[];
  tools: Tool[];
  /** fills / tools baked into the mesh on screen */
  renderedFills: Fill[] | null;
  /** loaded tool meshes by upload path */
  toolMeshes: Map<string, ToolMesh>;
}

export interface ToolEvents {
  commit(patch: EditPatch, keepSelection?: boolean): void;
  select(selection: ToolSelection): void;
  /** Screen position for the floating action bar, reported every frame. */
  anchor(point: { x: number; y: number } | null): void;
}

type Hover =
  | { kind: "wall"; wall: L.Wall }
  | { kind: "tool"; index: number }
  | { kind: "ring"; index: number }
  | { kind: "region"; id: number; fx: number; fy: number; shift: boolean; alt: boolean }
  | null;

const MIN_MM = 5;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

const fmt = (mm: number) =>
  Math.abs(mm - Math.round(mm)) < 0.05 ? `${Math.round(mm)}` : mm.toFixed(1);

/** The lid closes over the hinge, so its layout is the base's mirrored front-to-back. */
function mirrored(l: L.Layout): L.Layout {
  const C = L.colCount(l);
  const R = L.rowCount(l);
  const cells: number[] = [];
  for (let r = R - 1; r >= 0; r--) for (let c = 0; c < C; c++) cells.push(l.cells[r * C + c]);
  return { cols: l.cols, rows: [...l.rows].reverse().map((f) => 1 - f), cells };
}

/**
 * Edits the compartment layout directly on the 3D model: hover and click
 * compartments, drag walls along their axis, split with a ghost wall that
 * follows the cursor. Walls are previewed as real geometry until the next
 * OpenSCAD render replaces them.
 */
export class LayoutTool {
  private viewer: Viewer;
  private events: ToolEvents;
  private group = new THREE.Group();
  private labelsEl: HTMLDivElement;
  private labels: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];
  private enabled = false;
  private frame: LayoutFrame | null = null;
  private state: ToolState | null = null;
  private hover: Hover = null;
  private draft: L.Layout | null = null;
  private toolDraft: Tool[] | null = null;
  private drag: {
    wall: L.Wall;
    x0: number;
    y0: number;
    active: boolean;
    pointerId: number;
  } | null = null;
  private toolDrag: {
    kind: "move" | "rotate";
    index: number;
    x0: number;
    y0: number;
    active: boolean;
    pointerId: number;
    grab: THREE.Vector2;
    startAngle: number;
    startRz: number;
  } | null = null;
  private ghostGeometries = new Map<string, THREE.BufferGeometry>();
  private ghosts: THREE.Mesh[] = [];
  private rings: { index: number; center: THREE.Vector3; r0: number; r1: number }[] = [];
  private down: { x: number; y: number; button: number } | null = null;
  private hits: { wall: L.Wall; box: THREE.Box3 }[] = [];
  private unsubscribe: () => void;

  private mats = {
    preview: new THREE.MeshStandardMaterial({
      color: 0x5b6578,
      roughness: 0.6,
      emissive: 0x1b3550,
      emissiveIntensity: 0.35,
    }),
    hoverWall: new THREE.MeshBasicMaterial({
      color: 0x8fd0ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    selectWall: new THREE.MeshBasicMaterial({
      color: 0xff9f43,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
    dragWall: new THREE.MeshBasicMaterial({
      color: 0xffb86b,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
    ghost: new THREE.MeshBasicMaterial({
      color: 0x62b8ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
    hoverFloor: floorMaterial(0x62b8ff, 0.22),
    selectFloor: floorMaterial(0x3f9dff, 0.5),
    dimLine: new THREE.LineBasicMaterial({ color: 0xff9f43, depthTest: false, transparent: true }),
    toolGhost: new THREE.MeshLambertMaterial({
      color: 0xffa14a,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
      depthWrite: false,
    }),
    toolHover: new THREE.MeshLambertMaterial({
      color: 0xffb86b,
      transparent: true,
      opacity: 0.62,
      depthTest: false,
      depthWrite: false,
    }),
    toolSelected: new THREE.MeshLambertMaterial({
      color: 0xffc27a,
      emissive: 0x552200,
      transparent: true,
      opacity: 0.78,
      depthTest: false,
      depthWrite: false,
    }),
    toolBad: new THREE.MeshLambertMaterial({
      color: 0xff5c5c,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      depthWrite: false,
    }),
    ring: new THREE.MeshBasicMaterial({
      color: 0x62b8ff,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ringHover: new THREE.MeshBasicMaterial({
      color: 0xa6dcff,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    fillPreview: new THREE.MeshStandardMaterial({
      color: 0x8a96a8,
      roughness: 0.7,
      transparent: true,
      opacity: 0.85,
    }),
  };

  constructor(viewer: Viewer, events: ToolEvents) {
    this.viewer = viewer;
    this.events = events;
    this.group.renderOrder = 2;
    viewer.root.add(this.group);

    this.labelsEl = document.createElement("div");
    this.labelsEl.className = "vp-labels";
    viewer.canvas.parentElement?.appendChild(this.labelsEl);

    const c = viewer.canvas;
    // Capture phase so a wall grab can pre-empt OrbitControls' own pointerdown.
    c.addEventListener("pointerdown", this.onDown, { capture: true });
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("pointerleave", this.onLeave);
    c.addEventListener("dblclick", this.onDoubleClick);
    c.addEventListener("contextmenu", this.onContextMenu);
    this.unsubscribe = viewer.onFrame(this.onFrame);
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.hover = null;
    this.draft = null;
    this.rebuild();
  }

  setFrame(frame: LayoutFrame | null) {
    this.frame = frame;
    this.rebuild();
  }

  setState(state: ToolState) {
    if (this.draft && (!this.state || !L.sameLayout(state.layout, this.state.layout)))
      this.draft = null;
    if (this.toolDraft && (!this.state || this.state.tools !== state.tools)) this.toolDraft = null;
    this.state = state;
    if (state.mode === "select" && this.hover?.kind === "region") this.hover = null;
    this.rebuild();
  }

  /** Model-space box around the base interior, for camera focus. */
  baseBounds(): [THREE.Vector3, THREE.Vector3] | null {
    if (!this.frame) return null;
    const { base, w, d, h } = this.frame;
    return [base.clone(), base.clone().add(new THREE.Vector3(w, d, h))];
  }

  dispose() {
    const c = this.viewer.canvas;
    c.removeEventListener("pointerdown", this.onDown, { capture: true });
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("pointerleave", this.onLeave);
    c.removeEventListener("dblclick", this.onDoubleClick);
    c.removeEventListener("contextmenu", this.onContextMenu);
    this.unsubscribe();
    for (const g of this.ghostGeometries.values()) g.dispose();
    this.clear();
    this.viewer.root.remove(this.group);
    this.labelsEl.remove();
    Object.values(this.mats).forEach((m) => m.dispose());
  }

  private active(): boolean {
    return this.enabled && !!this.frame && !!this.state;
  }

  // ---------------------------------------------------------------- picking

  private pick(
    clientX: number,
    clientY: number,
    withWalls = this.state!.mode === "select",
  ): {
    wall?: L.Wall;
    region?: { id: number; fx: number; fy: number };
    tool?: number;
    ring?: number;
  } {
    const frame = this.frame!;
    const layout = this.state!.layout;
    const ray = this.viewer.rayAt(clientX, clientY);

    if (withWalls) {
      // Rotation ring of the selected tool, then the tools themselves (drawn on top of everything).
      for (const ring of this.rings) {
        const hit = ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 0, 1), -ring.center.z),
          new THREE.Vector3(),
        );
        if (hit) {
          const r = Math.hypot(hit.x - ring.center.x, hit.y - ring.center.y);
          if (r >= ring.r0 - 1.5 && r <= ring.r1 + 1.5) return { ring: ring.index };
        }
      }
      if (this.ghosts.length) {
        const rect = this.viewer.canvas.getBoundingClientRect();
        const caster = new THREE.Raycaster();
        caster.setFromCamera(
          new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
          ),
          this.viewer.activeCamera,
        );
        const hit = caster.intersectObjects(this.ghosts, false)[0];
        if (hit) return { tool: hit.object.userData.toolIndex as number };
      }
    }

    const floor = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(frame.base.z + 0.2));
    const floorHit = ray.intersectPlane(floor, new THREE.Vector3());
    const floorDist = floorHit ? floorHit.distanceTo(ray.origin) : Infinity;

    let wall: L.Wall | undefined;
    let best = Infinity;
    const point = new THREE.Vector3();
    for (const hit of withWalls ? this.hits : []) {
      if (ray.intersectBox(hit.box, point)) {
        const dist = point.distanceTo(ray.origin);
        if (dist < best) {
          best = dist;
          wall = hit.wall;
        }
      }
    }
    if (wall && best <= floorDist + 0.5) return { wall };

    if (floorHit) {
      const fx = (floorHit.x - frame.base.x) / frame.w;
      const fy = (floorHit.y - frame.base.y) / frame.d;
      const id = L.regionAt(layout, fx, fy);
      if (id !== undefined) return { region: { id, fx, fy } };
    }
    return {};
  }

  /** Height of the fill a tool sits in (0 when its point is not in a filled compartment). */
  private fillTopAt(xmm: number, ymm: number): number {
    const state = this.state!;
    const frame = this.frame!;
    const layout = this.draft ?? state.layout;
    const id = L.regionAt(layout, xmm / frame.w, ymm / frame.d);
    if (id === undefined) return 0;
    const i = fillFor(layout, state.fills, id);
    return i < 0 ? 0 : Math.min(state.fills[i].height, frame.h - 0.2);
  }

  /** Where the pointer meets the horizontal plane at model height `z`, in grid mm. */
  private planeHit(clientX: number, clientY: number, z: number): THREE.Vector2 | null {
    const frame = this.frame!;
    const hit = this.viewer
      .rayAt(clientX, clientY)
      .intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
    return hit ? new THREE.Vector2(hit.x - frame.base.x, hit.y - frame.base.y) : null;
  }

  private toolTopZ(t: Tool): number {
    return this.frame!.base.z + 0.1 + this.fillTopAt(t.x, t.y);
  }

  private ghostGeometry(file: string): THREE.BufferGeometry | null {
    const cached = this.ghostGeometries.get(file);
    if (cached) return cached;
    const mesh = this.state!.toolMeshes.get(file);
    if (!mesh) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    g.computeBoundingSphere();
    this.ghostGeometries.set(file, g);
    return g;
  }

  /** Position along `axis` (as a fraction) where the pointer meets the wall tops. */
  private axisFraction(clientX: number, clientY: number, axis: L.Axis): number | null {
    const frame = this.frame!;
    const ray = this.viewer.rayAt(clientX, clientY);
    for (const z of [frame.base.z + frame.h, frame.base.z]) {
      const hit = ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -z),
        new THREE.Vector3(),
      );
      if (hit)
        return axis === "x" ? (hit.x - frame.base.x) / frame.w : (hit.y - frame.base.y) / frame.d;
    }
    return null;
  }

  private snapped(f: number, axis: L.Axis, free: boolean): number {
    const size = axis === "x" ? this.frame!.w : this.frame!.d;
    const snap = this.state!.snap;
    if (!snap || free) return f;
    return (Math.round((f * size) / snap) * snap) / size;
  }

  // ---------------------------------------------------------------- pointer

  private onDown = (e: PointerEvent) => {
    if (!this.active()) return;
    if (e.button === 0 && this.state!.mode === "select") {
      const { wall, tool, ring } = this.pick(e.clientX, e.clientY);
      const index = ring ?? tool;
      if (index !== undefined) {
        const t = this.state!.tools[index];
        const at = this.planeHit(e.clientX, e.clientY, this.toolTopZ(t));
        if (at) {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.viewer.canvas.setPointerCapture(e.pointerId);
          this.toolDrag = {
            kind: ring !== undefined ? "rotate" : "move",
            index,
            x0: e.clientX,
            y0: e.clientY,
            active: false,
            pointerId: e.pointerId,
            grab: new THREE.Vector2(at.x - t.x, at.y - t.y),
            startAngle: Math.atan2(at.y - t.y, at.x - t.x),
            startRz: t.rz,
          };
          return;
        }
      }
      if (wall) {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.viewer.canvas.setPointerCapture(e.pointerId);
        this.drag = { wall, x0: e.clientX, y0: e.clientY, active: false, pointerId: e.pointerId };
        return;
      }
    }
    this.down = { x: e.clientX, y: e.clientY, button: e.button };
  };

  private onMove = (e: PointerEvent) => {
    if (!this.active()) return;
    const state = this.state!;

    if (this.toolDrag) {
      const d = this.toolDrag;
      if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 3) d.active = true;
      if (!d.active) return;
      const base = state.tools[d.index];
      const at = this.planeHit(e.clientX, e.clientY, this.toolTopZ(base));
      if (!at) return;
      const next = [...state.tools];
      if (d.kind === "move") {
        let x = at.x - d.grab.x;
        let y = at.y - d.grab.y;
        if (state.snap && !e.altKey) {
          x = Math.round(x / state.snap) * state.snap;
          y = Math.round(y / state.snap) * state.snap;
        }
        next[d.index] = { ...base, x, y };
      } else {
        const angle = Math.atan2(at.y - base.y, at.x - base.x);
        let rz = d.startRz + ((angle - d.startAngle) * 180) / Math.PI;
        const step = e.altKey ? 1 : 15;
        rz = Math.round(rz / step) * step;
        rz = ((((rz + 180) % 360) + 360) % 360) - 180;
        next[d.index] = { ...base, rz };
      }
      this.toolDraft = next;
      this.rebuild();
      return;
    }

    if (this.drag) {
      const d = this.drag;
      if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 3) d.active = true;
      if (!d.active) return;
      const f = this.axisFraction(e.clientX, e.clientY, d.wall.axis);
      if (f === null) return;
      const size = d.wall.axis === "x" ? this.frame!.w : this.frame!.d;
      this.draft = L.moveLine(
        state.layout,
        d.wall.axis,
        d.wall.line,
        this.snapped(f, d.wall.axis, e.altKey),
        MIN_MM / size,
      );
      this.rebuild();
      return;
    }

    const { wall, region, tool, ring } = this.pick(e.clientX, e.clientY);
    let next: Hover = null;
    if (state.mode === "select") {
      if (ring !== undefined) next = { kind: "ring", index: ring };
      else if (tool !== undefined) next = { kind: "tool", index: tool };
      else if (wall) next = { kind: "wall", wall };
      else if (region) next = { kind: "region", ...region, shift: e.shiftKey, alt: e.altKey };
    } else if (region) {
      next = { kind: "region", ...region, shift: e.shiftKey, alt: e.altKey };
    }
    this.viewer.canvas.style.cursor =
      state.mode !== "select"
        ? region
          ? "crosshair"
          : ""
        : ring !== undefined
          ? "grab"
          : tool !== undefined
            ? "move"
            : wall
              ? wall.axis === "x"
                ? "ew-resize"
                : "ns-resize"
              : region
                ? "pointer"
                : "";

    // Split previews track the cursor continuously; otherwise only rebuild on change.
    if (state.mode !== "select" || hoverKey(next) !== hoverKey(this.hover)) {
      this.hover = next;
      this.rebuild();
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.active()) return;
    const state = this.state!;

    if (this.toolDrag) {
      const d = this.toolDrag;
      this.toolDrag = null;
      if (this.viewer.canvas.hasPointerCapture(d.pointerId))
        this.viewer.canvas.releasePointerCapture(d.pointerId);
      if (d.active && this.toolDraft) this.events.commit({ tools: this.toolDraft }, true);
      this.events.select({ kind: "tool", index: d.index });
      this.rebuild();
      return;
    }

    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (this.viewer.canvas.hasPointerCapture(d.pointerId))
        this.viewer.canvas.releasePointerCapture(d.pointerId);
      if (d.active && this.draft) {
        if (L.sameLayout(this.draft, state.layout)) this.draft = null;
        this.events.commit({ layout: this.draft ?? state.layout }, true);
        this.events.select({
          kind: "wall",
          axis: d.wall.axis,
          line: d.wall.line,
          a: d.wall.a,
          b: d.wall.b,
        });
      } else {
        this.events.select({
          kind: "wall",
          axis: d.wall.axis,
          line: d.wall.line,
          a: d.wall.a,
          b: d.wall.b,
        });
      }
      this.rebuild();
      return;
    }

    const down = this.down;
    this.down = null;
    if (!down || down.button !== e.button || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5)
      return;
    if (e.button !== 0) return;

    const { wall, region } = this.pick(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    if (state.mode === "select") {
      if (wall) {
        this.events.select({
          kind: "wall",
          axis: wall.axis,
          line: wall.line,
          a: wall.a,
          b: wall.b,
        });
      } else if (region) {
        const current = state.selection?.kind === "regions" ? state.selection.ids : [];
        if (additive) {
          const ids = current.includes(region.id)
            ? current.filter((x) => x !== region.id)
            : [...current, region.id];
          this.events.select(ids.length ? { kind: "regions", ids } : null);
        } else {
          this.events.select({ kind: "regions", ids: [region.id] });
        }
      } else {
        this.events.select(null);
      }
      return;
    }

    if (region) {
      const axis: L.Axis = state.mode === "split-x" ? "x" : "y";
      const f = this.snapped(axis === "x" ? region.fx : region.fy, axis, e.altKey);
      if (f > 0 && f < 1)
        this.events.commit({
          layout: L.addLine(state.layout, axis, f, e.shiftKey ? undefined : region.id),
        });
    }
  };

  private onLeave = () => {
    if (this.drag || this.toolDrag) return;
    this.viewer.canvas.style.cursor = "";
    if (this.hover) {
      this.hover = null;
      this.rebuild();
    }
  };

  private onDoubleClick = (e: MouseEvent) => {
    if (!this.active() || this.state!.mode !== "select") return;
    const { wall } = this.pick(e.clientX, e.clientY);
    if (wall) {
      this.events.commit({ layout: L.merge(this.state!.layout, [wall.a, wall.b]) });
      this.hover = null;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    if (!this.active()) return;
    const { wall, region, tool, ring } = this.pick(e.clientX, e.clientY);
    if (!wall && !region && tool === undefined && ring === undefined) return;
    e.preventDefault();
    if ((tool ?? ring) !== undefined) this.events.select({ kind: "tool", index: (tool ?? ring)! });
    else if (wall)
      this.events.select({ kind: "wall", axis: wall.axis, line: wall.line, a: wall.a, b: wall.b });
    else if (region) this.events.select({ kind: "regions", ids: [region.id] });
  };

  // ---------------------------------------------------------------- drawing

  private clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Line || child.userData.ownsGeometry)
        (child as THREE.Mesh).geometry.dispose();
    }
    this.ghosts = [];
    this.rings = [];
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    this.hits = [];
  }

  private rebuild() {
    this.clear();
    if (!this.active()) {
      this.viewer.setForcedHidden([]);
      this.viewer.canvas.style.cursor = "";
      return;
    }
    const frame = this.frame!;
    const state = this.state!;
    const layout = this.draft ?? state.layout;
    const { w: W, d: D, h: H, base: o, wallT: T } = frame;
    const X = L.xLines(layout);
    const Y = L.yLines(layout);
    const walls = L.walls(layout);
    const regions = L.regions(layout);

    // Until OpenSCAD catches up, draw the pending walls ourselves and hide the stale ones.
    const previewing = !state.rendered || !L.sameLayout(layout, state.rendered);
    const slot = this.viewer.slotForColor(frame.dividerColor);
    // Fills change shape with the layout too, so preview them in either case.
    const fillsPending =
      state.fills.length > 0 &&
      (previewing || JSON.stringify(state.fills) !== JSON.stringify(state.renderedFills ?? []));
    const insertSlot = frame.insertColor ? this.viewer.slotForColor(frame.insertColor) : undefined;
    const hide: number[] = [];
    if (previewing && slot !== undefined) hide.push(slot);
    if (
      (fillsPending || (state.fills.length === 0 && (state.renderedFills?.length ?? 0) > 0)) &&
      insertSlot !== undefined
    )
      hide.push(insertSlot);
    this.viewer.setForcedHidden(hide);
    if (fillsPending) {
      for (const f of state.fills) {
        const id = L.regionAt(layout, f.fx, f.fy);
        const h = Math.min(f.height, H - 0.2);
        for (const reg of regions) {
          if (reg.id !== id) continue;
          for (const { r, c } of reg.cells) {
            const box = new THREE.Mesh(UNIT_BOX, this.mats.fillPreview);
            box.scale.set((X[c + 1] - X[c]) * W, (Y[r + 1] - Y[r]) * D, h + 0.1);
            box.position.set(
              o.x + ((X[c] + X[c + 1]) / 2) * W,
              o.y + ((Y[r] + Y[r + 1]) / 2) * D,
              o.z + (h + 0.1) / 2,
            );
            this.group.add(box);
          }
        }
      }
    }
    if (previewing) {
      for (const w of walls) this.addWallBox(w, layout, o, W, D, H, T, this.mats.preview, 0);
      if (state.lidDividers) {
        const lidLayout = mirrored(layout);
        for (const w of L.walls(lidLayout))
          this.addWallBox(
            w,
            lidLayout,
            frame.lid,
            W,
            frame.lidD,
            frame.lidH,
            T,
            this.mats.preview,
            0,
          );
      }
    }

    // Grab targets, fattened so thin walls are easy to hit.
    for (const w of walls) {
      const { center, size } = wallGeometry(w, X, Y, o, W, D, H, Math.max(T, 3.2));
      size.z += 1.5;
      this.hits.push({ wall: w, box: new THREE.Box3().setFromCenterAndSize(center, size) });
    }

    const pair = (w: L.Wall, a: number, b: number) =>
      (w.a === a && w.b === b) || (w.a === b && w.b === a);
    const sel = state.selection;

    // Walls: hover, selection, and the whole line while dragging.
    if (this.drag?.active) {
      const { axis, line } = this.drag.wall;
      for (const w of walls)
        if (w.axis === axis && w.line === line)
          this.addWallBox(w, layout, o, W, D, H, T, this.mats.dragWall, 0.5);
      this.addDimensionChain(axis, line, X, Y, o, W, D, H);
    } else {
      if (sel?.kind === "wall") {
        for (const w of walls)
          if (pair(w, sel.a, sel.b))
            this.addWallBox(w, layout, o, W, D, H, T, this.mats.selectWall, 0.5);
      }
      if (this.hover?.kind === "wall" && state.mode === "select") {
        const hw = this.hover.wall;
        if (!(sel?.kind === "wall" && pair(hw, sel.a, sel.b)))
          for (const w of walls)
            if (pair(w, hw.a, hw.b))
              this.addWallBox(w, layout, o, W, D, H, T, this.mats.hoverWall, 0.4);
        this.addLabel(
          wallMidTop(hw, X, Y, o, W, D, H),
          `${fmt(hw.axis === "x" ? X[hw.line] * W : Y[hw.line] * D)} mm`,
          "wall",
        );
      }
    }

    // Compartments: selection and hover fills on the floor, with sizes.
    const selectedIds = sel?.kind === "regions" ? sel.ids : [];
    const regionFill = (id: number) => {
      const i = fillFor(layout, state.fills, id);
      return i < 0 ? 0 : Math.min(state.fills[i].height, H - 0.2) + 0.1;
    };
    for (const reg of regions) {
      const selected = selectedIds.includes(reg.id);
      const hovered = this.hover?.kind === "region" && this.hover.id === reg.id && !this.drag;
      if (!selected && !hovered) continue;
      for (const { r, c } of reg.cells) {
        const quad = new THREE.Mesh(
          UNIT_PLANE,
          selected ? this.mats.selectFloor : this.mats.hoverFloor,
        );
        quad.scale.set((X[c + 1] - X[c]) * W + 0.05, (Y[r + 1] - Y[r]) * D + 0.05, 1);
        quad.position.set(
          o.x + ((X[c] + X[c + 1]) / 2) * W,
          o.y + ((Y[r] + Y[r + 1]) / 2) * D,
          o.z + 0.35 + regionFill(reg.id),
        );
        quad.renderOrder = 1;
        this.group.add(quad);
      }
      if (state.mode === "select" || selected) {
        const text = reg.rectangular
          ? `${fmt((reg.x1 - reg.x0) * W)} × ${fmt((reg.y1 - reg.y0) * D)}`
          : `${fmt((reg.area * W * D) / 100)} cm²`;
        const filled = regionFill(reg.id);
        this.addLabel(
          new THREE.Vector3(o.x + reg.label.x * W, o.y + reg.label.y * D, o.z + 0.5 + filled),
          filled ? `${text} · filled ${fmt(filled - 0.1)}` : text,
          selected ? "selected" : "",
        );
      }
    }

    // Tools pressed into fills: translucent ghosts, drawn over everything.
    const tools = this.toolDraft ?? state.tools;
    tools.forEach((t, index) => {
      const geometry = this.ghostGeometry(t.file);
      const mesh = state.toolMeshes.get(t.file);
      if (!geometry || !mesh) return;
      const fillTop = this.fillTopAt(t.x, t.y);
      const top = o.z + 0.1 + fillTop;
      const fp = footprint(t, mesh);
      const regionId = L.regionAt(layout, t.x / W, t.y / D);
      const reg = regions.find((r) => r.id === regionId);
      const fits =
        !!reg &&
        fillTop > 0 &&
        t.x - fp.hx >= reg.x0 * W - 0.05 &&
        t.x + fp.hx <= reg.x1 * W + 0.05 &&
        t.y - fp.hy >= reg.y0 * D - 0.05 &&
        t.y + fp.hy <= reg.y1 * D + 0.05;
      const selected = sel?.kind === "tool" && sel.index === index;
      const hovered =
        (this.hover?.kind === "tool" || this.hover?.kind === "ring") && this.hover.index === index;
      const material = !fits
        ? this.mats.toolBad
        : selected
          ? this.mats.toolSelected
          : hovered
            ? this.mats.toolHover
            : this.mats.toolGhost;

      const outer = new THREE.Group();
      outer.position.set(o.x + t.x, o.y + t.y, top - t.depth);
      outer.rotation.z = (t.rz * Math.PI) / 180;
      const offset = new THREE.Group();
      offset.position.set(t.ox, t.oy, t.oz);
      const ghost = new THREE.Mesh(geometry, material);
      ghost.rotation.set((t.rx * Math.PI) / 180, (t.ry * Math.PI) / 180, 0, "ZYX");
      ghost.userData.toolIndex = index;
      ghost.renderOrder = 5;
      offset.add(ghost);
      outer.add(offset);
      this.group.add(outer);
      this.ghosts.push(ghost);

      const dragging =
        this.toolDrag?.active && this.toolDrag.index === index ? this.toolDrag : null;
      if (selected && state.mode === "select") {
        // Rotation knob just past the tool's tip, on a short leader line.
        const laid = laidBounds(mesh, t.rx, t.ry);
        const reach = laid.sx / 2 + t.clearance + 7;
        const a = (t.rz * Math.PI) / 180;
        const z = top + 0.5;
        const knobAt = new THREE.Vector3(
          o.x + t.x + Math.cos(a) * reach,
          o.y + t.y + Math.sin(a) * reach,
          z,
        );
        const knobHovered = this.hover?.kind === "ring" && this.hover.index === index;
        const turning = dragging?.kind === "rotate";
        const knob = new THREE.Mesh(
          new THREE.CircleGeometry(knobHovered || turning ? 3.2 : 2.6, 24),
          knobHovered || turning ? this.mats.ringHover : this.mats.ring,
        );
        knob.userData.ownsGeometry = true;
        knob.position.copy(knobAt);
        knob.renderOrder = 7;
        this.group.add(knob);
        const leaderStart = new THREE.Vector3(
          o.x + t.x + Math.cos(a) * (reach - 6),
          o.y + t.y + Math.sin(a) * (reach - 6),
          z,
        );
        const leader = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([leaderStart, knobAt]),
          this.mats.dimLine,
        );
        leader.renderOrder = 7;
        this.group.add(leader);
        this.rings.push({ index, center: knobAt, r0: 0, r1: 3.5 });
        if (turning) {
          const guide = new THREE.Mesh(
            new THREE.RingGeometry(reach - 0.35, reach + 0.35, 96),
            this.mats.ring,
          );
          guide.userData.ownsGeometry = true;
          guide.position.set(o.x + t.x, o.y + t.y, z - 0.05);
          guide.renderOrder = 6;
          this.group.add(guide);
        }
      }

      const labelAt = new THREE.Vector3(o.x + t.x, o.y + t.y, top + 2);
      if (dragging?.kind === "rotate") this.addLabel(labelAt, `${Math.round(t.rz)}°`, "dim");
      else if (dragging) this.addLabel(labelAt, `${fmt(t.x)}, ${fmt(t.y)} mm`, "dim");
      else if (!fits && (selected || hovered || !reg || fillTop === 0))
        this.addLabel(
          labelAt,
          fillTop === 0 ? "not in a filled compartment" : "sticks out of its compartment",
          "bad",
        );
      else if (selected || hovered)
        this.addLabel(
          labelAt,
          `${mesh.name} · ${fmt(t.depth)} mm deep`,
          selected ? "selected" : "wall",
        );
    });
    this.viewer.root.updateMatrixWorld(true);

    // Split tool: a ghost wall under the cursor.
    if (state.mode !== "select" && this.hover?.kind === "region") {
      const hv = this.hover;
      const axis: L.Axis = state.mode === "split-x" ? "x" : "y";
      const reg = regions.find((r) => r.id === hv.id);
      const f = this.snapped(axis === "x" ? hv.fx : hv.fy, axis, hv.alt);
      if (reg && f > 0 && f < 1) {
        const from = hv.shift ? 0 : axis === "x" ? reg.y0 : reg.x0;
        const to = hv.shift ? 1 : axis === "x" ? reg.y1 : reg.x1;
        const lo = hv.shift ? 0 : axis === "x" ? reg.x0 : reg.y0;
        const hi = hv.shift ? 1 : axis === "x" ? reg.x1 : reg.y1;
        const ghost = new THREE.Mesh(UNIT_BOX, this.mats.ghost);
        if (axis === "x") {
          ghost.scale.set(T + 0.4, (to - from) * D, H);
          ghost.position.set(o.x + f * W, o.y + ((from + to) / 2) * D, o.z + H / 2);
        } else {
          ghost.scale.set((to - from) * W, T + 0.4, H);
          ghost.position.set(o.x + ((from + to) / 2) * W, o.y + f * D, o.z + H / 2);
        }
        ghost.renderOrder = 3;
        this.group.add(ghost);
        const size = axis === "x" ? W : D;
        const top = ghost.position.clone().setZ(o.z + H + 1);
        this.addLabel(top, `${fmt((f - lo) * size)}  |  ${fmt((hi - f) * size)}`, "ghost");
      }
    }
  }

  private addWallBox(
    w: L.Wall,
    layout: L.Layout,
    o: THREE.Vector3,
    W: number,
    D: number,
    H: number,
    T: number,
    material: THREE.Material,
    grow: number,
  ) {
    const { center, size } = wallGeometry(w, L.xLines(layout), L.yLines(layout), o, W, D, H, T);
    const box = new THREE.Mesh(UNIT_BOX, material);
    box.scale.set(size.x + grow, size.y + grow, size.z + grow);
    box.position.copy(center);
    box.renderOrder = grow > 0 ? 2 : 0;
    this.group.add(box);
  }

  /** CAD-style dimension line along the outside of the box for a moving divider. */
  private addDimensionChain(
    axis: L.Axis,
    line: number,
    X: number[],
    Y: number[],
    o: THREE.Vector3,
    W: number,
    D: number,
    H: number,
  ) {
    const lines = axis === "x" ? X : Y;
    const size = axis === "x" ? W : D;
    const z = o.z + H + 1;
    const offset = 6;
    const at = (f: number) =>
      axis === "x"
        ? new THREE.Vector3(o.x + f * W, o.y + D + offset, z)
        : new THREE.Vector3(o.x + W + offset, o.y + f * D, z);
    const pts: THREE.Vector3[] = [];
    const stops = [lines[line - 1], lines[line], lines[line + 1]];
    pts.push(at(stops[0]), at(stops[2]));
    for (const f of stops) {
      const p = at(f);
      const q = axis === "x" ? p.clone().setY(o.y + D) : p.clone().setX(o.x + W);
      pts.push(
        q,
        p.clone().add(axis === "x" ? new THREE.Vector3(0, 1.5, 0) : new THREE.Vector3(1.5, 0, 0)),
      );
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const segments = new THREE.LineSegments(geometry, this.mats.dimLine);
    segments.renderOrder = 4;
    this.group.add(segments);
    for (let i = 0; i < 2; i++) {
      const mid = at((stops[i] + stops[i + 1]) / 2);
      this.addLabel(mid, `${fmt((stops[i + 1] - stops[i]) * size)}`, "dim");
    }
  }

  private addLabel(at: THREE.Vector3, text: string, variant: string) {
    const el = document.createElement("div");
    el.className = `vp-label ${variant}`;
    el.textContent = text;
    this.labelsEl.appendChild(el);
    this.labels.push({ el, at });
    this.placeLabel(el, at);
  }

  private placeLabel(el: HTMLDivElement, at: THREE.Vector3) {
    const p = this.viewer.project(at);
    if (!p) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  }

  private onFrame = () => {
    for (const l of this.labels) this.placeLabel(l.el, l.at);
    if (!this.active()) {
      this.events.anchor(null);
      return;
    }
    const anchor = this.selectionAnchor();
    this.events.anchor(anchor ? this.viewer.project(anchor) : null);
  };

  private selectionAnchor(): THREE.Vector3 | null {
    const sel = this.state!.selection;
    if (!sel || this.drag?.active || this.toolDrag?.active) return null;
    const frame = this.frame!;
    const layout = this.draft ?? this.state!.layout;
    const { w: W, d: D, h: H, base: o } = frame;
    if (sel.kind === "regions") {
      const regs = L.regions(layout).filter((r) => sel.ids.includes(r.id));
      if (!regs.length) return null;
      const x0 = Math.min(...regs.map((r) => r.x0));
      const x1 = Math.max(...regs.map((r) => r.x1));
      const y1 = Math.max(...regs.map((r) => r.y1));
      return new THREE.Vector3(o.x + ((x0 + x1) / 2) * W, o.y + y1 * D, o.z + H + 2);
    }
    if (sel.kind === "tool") {
      const t = (this.toolDraft ?? this.state!.tools)[sel.index];
      const mesh = t && this.state!.toolMeshes.get(t.file);
      if (!t || !mesh) return null;
      const fp = footprint(t, mesh);
      return new THREE.Vector3(
        o.x + t.x,
        o.y + t.y + fp.hy + 6,
        o.z + 0.1 + this.fillTopAt(t.x, t.y) + 2,
      );
    }
    const walls = L.walls(layout).filter(
      (w) => (w.a === sel.a && w.b === sel.b) || (w.a === sel.b && w.b === sel.a),
    );
    if (!walls.length) return null;
    return wallMidTop(
      walls[Math.floor(walls.length / 2)],
      L.xLines(layout),
      L.yLines(layout),
      o,
      W,
      D,
      H,
    ).setZ(o.z + H + 2);
  }
}

function floorMaterial(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function wallGeometry(
  w: L.Wall,
  X: number[],
  Y: number[],
  o: THREE.Vector3,
  W: number,
  D: number,
  H: number,
  T: number,
) {
  if (w.axis === "x") {
    const y0 = Y[w.index] * D;
    const y1 = Y[w.index + 1] * D;
    return {
      center: new THREE.Vector3(o.x + X[w.line] * W, o.y + (y0 + y1) / 2, o.z + H / 2),
      size: new THREE.Vector3(T, y1 - y0 + T, H),
    };
  }
  const x0 = X[w.index] * W;
  const x1 = X[w.index + 1] * W;
  return {
    center: new THREE.Vector3(o.x + (x0 + x1) / 2, o.y + Y[w.line] * D, o.z + H / 2),
    size: new THREE.Vector3(x1 - x0 + T, T, H),
  };
}

function wallMidTop(
  w: L.Wall,
  X: number[],
  Y: number[],
  o: THREE.Vector3,
  W: number,
  D: number,
  H: number,
) {
  return wallGeometry(w, X, Y, o, W, D, H, 0).center.setZ(o.z + H + 1);
}

function hoverKey(h: Hover): string {
  if (!h) return "";
  switch (h.kind) {
    case "wall":
      return `w${h.wall.axis}${h.wall.line}-${h.wall.index}`;
    case "region":
      return `r${h.id}`;
    default:
      return `${h.kind}${h.index}`;
  }
}
