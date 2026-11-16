# Clamshell Box Configurator

A web configurator for `model/clamshell.scad`, ported from
[cnbrown04/model-viewer](https://github.com/cnbrown04/model-viewer). It runs
entirely in the visitor's browser:

```
params ─▶ Rust/wasm planner ─▶ OpenSCAD (wasm) × N workers ─▶ 3MF per part
   ▲                                                                │
   └── three.js WebGPU view ◀── Rust/wasm decode (normals, edges, volume) ◀── merge
```

- **Geometry** runs on the visitor's CPU cores: the official OpenSCAD
  WebAssembly build (`vendor/openscad/`, Manifold backend) in a pool of Web
  Workers. Each model part (`base`, `lid`, `dividers`, `inserts`) renders in
  parallel and is cached under a key that ignores parameters the part doesn't
  use. OpenSCAD's CSG has no GPU implementation, so this part can't move to
  the GPU.
- **Drawing** runs on the visitor's GPU: three.js `WebGPURenderer`, which falls
  back to WebGL 2 when WebGPU isn't available. The status bar shows which.
- **Rust (`wasm/`)**: the Customizer parser, render planning and cache keys,
  and the mesh code (3MF/STL import, merging, crease-aware normals, feature
  edges, volume and area). Run `cargo test -p model-viewer`.
- **STEP export**: OpenSCAD only makes meshes, so `src/step/clamshell.ts`
  rebuilds the model in OpenCascade ([replicad](https://replicad.xyz)) with
  exact cylinders, cones and arcs, in a worker that loads its 22 MB wasm only
  when someone downloads a STEP file. OpenSCAD still resolves every size (run
  with `mv_part = "dims"`, the model reports them), but the construction is
  written twice: **when you change a shape in the scad, change it in
  `clamshell.ts` too.** `mise run check:step` (part of `mise run check`)
  compares the two part by part on volume, bounds, centre of mass and inertia,
  and fails if they drift. Pockets for imported tool meshes aren't in STEP yet.
- **Local data**: user presets, hidden-preset choices, uploaded tool meshes and
  the render cache live in the visitor's IndexedDB. Nothing is sent to a server.
  Built-in presets ship in `model/clamshell.presets.json`.

Changes from the server version: downloads are 3MF, STL, OBJ and STEP (no
PNG, OFF, parameters or source), and there's no background warm-up of presets,
so the first render of each preset takes one OpenSCAD run per part. In dev,
editing `model/clamshell.scad` hot-reloads the model and keeps your values.

## Credits and licenses

`model/clamshell.scad` is a changed version of the *Fully Configurable
Clamshell Box* by Melonee Wise (MakerWorld
[@chateauhouseyho](https://makerworld.com/en/@chateauhouseyho)), a remix of the
[Clamshell Parts Box](https://makerworld.com/en/models/786443-clamshell-parts-box).
The model keeps its original copyright and license. Some shapes come from
[BOSL2](https://github.com/BelfrySCAD/BOSL2) (BSD 2-Clause).

OpenSCAD is GPL-2.0-or-later; see `vendor/openscad/README.md` for the exact
build, checksum and source. STEP export uses
[replicad](https://github.com/sgenoud/replicad) (MIT) and its build of
[OpenCascade](https://dev.opencascade.org/) (`replicad-opencascadejs`,
LGPL-2.1), loaded as a separate WebAssembly module.
