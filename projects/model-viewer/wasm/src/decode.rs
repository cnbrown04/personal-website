//! Browser-side mesh decoding. Takes the server's `MVM1` buffer and produces
//! ready-to-upload three.js attributes: expanded positions, crease-aware
//! smoothed normals and per-vertex colors, plus the mass properties that the
//! viewer shows (bounds, surface area, volume).

use crate::mesh::Mesh;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct MeshData {
    positions: Vec<f32>,
    normals: Vec<f32>,
    colors: Vec<f32>,
    groups: Vec<u32>,
    ranges: Vec<u32>,
    edges: Vec<f32>,
    edge_ranges: Vec<u32>,
    palette: Vec<String>,
    min: [f32; 3],
    max: [f32; 3],
    triangles: usize,
    vertices: usize,
    area: f32,
    volume: f32,
}

#[wasm_bindgen]
impl MeshData {
    /// Expanded xyz triples, 3 vertices per triangle.
    #[wasm_bindgen(getter)]
    pub fn positions(&self) -> Vec<f32> {
        self.positions.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn normals(&self) -> Vec<f32> {
        self.normals.clone()
    }

    /// Linear-space rgb per vertex, matching the `color()` calls in the model.
    #[wasm_bindgen(getter)]
    pub fn colors(&self) -> Vec<f32> {
        self.colors.clone()
    }

    /// Material slot per triangle, so the UI can isolate or hide parts.
    #[wasm_bindgen(getter)]
    pub fn groups(&self) -> Vec<u32> {
        self.groups.clone()
    }

    /// `[slot, first_vertex, vertex_count]` triples. Vertex data is sorted by
    /// material, so each part is a contiguous range the viewer can draw directly.
    #[wasm_bindgen(getter)]
    pub fn ranges(&self) -> Vec<u32> {
        self.ranges.clone()
    }

    /// Feature edges as line-segment endpoints (xyz xyz per edge), sorted by material.
    #[wasm_bindgen(getter)]
    pub fn edges(&self) -> Vec<f32> {
        self.edges.clone()
    }

    /// `[slot, first_vertex, vertex_count]` triples into `edges`.
    #[wasm_bindgen(getter)]
    pub fn edge_ranges(&self) -> Vec<u32> {
        self.edge_ranges.clone()
    }

    /// Palette as `#rrggbb` strings.
    #[wasm_bindgen(getter)]
    pub fn palette(&self) -> Vec<JsValue> {
        self.palette.iter().map(JsValue::from).collect()
    }

    #[wasm_bindgen(getter)]
    pub fn bbox(&self) -> Vec<f32> {
        vec![
            self.min[0],
            self.min[1],
            self.min[2],
            self.max[0],
            self.max[1],
            self.max[2],
        ]
    }

    #[wasm_bindgen(getter)]
    pub fn triangle_count(&self) -> usize {
        self.triangles
    }

    #[wasm_bindgen(getter)]
    pub fn vertex_count(&self) -> usize {
        self.vertices
    }

    /// mm²
    #[wasm_bindgen(getter)]
    pub fn surface_area(&self) -> f32 {
        self.area
    }

    /// mm³ — enclosed volume, useful as a filament estimate.
    #[wasm_bindgen(getter)]
    pub fn volume(&self) -> f32 {
        self.volume
    }
}

/// Decode an `MVM1` buffer. `crease_degrees` is the angle above which an edge
/// stays sharp; 30° keeps CAD edges crisp while smoothing cylinder walls.
#[wasm_bindgen]
pub fn decode_mesh(bytes: &[u8], crease_degrees: f32) -> Result<MeshData, JsValue> {
    let mesh = crate::mesh::decode(bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(build(&mesh, crease_degrees))
}

/// Decode a raw 3MF or STL file (used for locally dropped files).
#[wasm_bindgen]
pub fn decode_model_file(bytes: &[u8], crease_degrees: f32) -> Result<MeshData, JsValue> {
    let mesh = crate::mesh::parse_auto(bytes).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(build(&mesh, crease_degrees))
}

fn build(mesh: &Mesh, crease_degrees: f32) -> MeshData {
    let tri_count = mesh.triangle_count();
    let (face_normals, area, volume) = face_data(mesh);
    let adjacency = Adjacency::build(mesh);
    let cos_limit = crease_degrees.to_radians().cos();

    let mut positions = Vec::with_capacity(tri_count * 9);
    let mut normals = Vec::with_capacity(tri_count * 9);
    let mut colors = Vec::with_capacity(tri_count * 9);
    let mut groups = Vec::with_capacity(tri_count);

    let srgb_to_linear = |c: u8| {
        let c = c as f32 / 255.0;
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };

    // Emit triangles grouped by material so each part is one contiguous range.
    let mut order: Vec<usize> = (0..tri_count).collect();
    order.sort_by_key(|&t| mesh.materials.get(t).copied().unwrap_or(0));
    let mut ranges: Vec<u32> = Vec::new();

    for &t in &order {
        let fn_ = face_normals[t];
        let slot = mesh.materials.get(t).copied().unwrap_or(0) as usize;
        let rgba = mesh
            .palette
            .get(slot)
            .copied()
            .unwrap_or([200, 200, 205, 255]);
        let rgb = [
            srgb_to_linear(rgba[0]),
            srgb_to_linear(rgba[1]),
            srgb_to_linear(rgba[2]),
        ];
        groups.push(slot as u32);
        let first = (positions.len() / 3) as u32;
        match ranges.as_chunks_mut::<3>().0.iter_mut().last() {
            Some(r) if r[0] == slot as u32 => r[2] += 3,
            _ => ranges.extend_from_slice(&[slot as u32, first, 3]),
        }

        for c in 0..3 {
            let vi = mesh.indices[t * 3 + c] as usize;
            let p = [
                mesh.positions[vi * 3],
                mesh.positions[vi * 3 + 1],
                mesh.positions[vi * 3 + 2],
            ];
            positions.extend_from_slice(&p);
            colors.extend_from_slice(&rgb);

            // Average in only the neighbours on the same smooth surface.
            let mut acc = [0.0f32; 3];
            for &f in adjacency.faces_of(vi) {
                let n = face_normals[f as usize];
                if dot(n, fn_) >= cos_limit {
                    let w = corner_angle(mesh, f as usize, vi);
                    acc[0] += n[0] * w;
                    acc[1] += n[1] * w;
                    acc[2] += n[2] * w;
                }
            }
            let n = normalize(acc).unwrap_or(fn_);
            normals.extend_from_slice(&n);
        }
    }

    let (edges, edge_ranges) = feature_edges(mesh, &face_normals, crease_degrees.max(1.0));
    let (min, max) = mesh.bounds();
    MeshData {
        positions,
        normals,
        colors,
        groups,
        ranges,
        edges,
        edge_ranges,
        palette: mesh
            .palette
            .iter()
            .map(|c| format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2]))
            .collect(),
        min,
        max,
        triangles: tri_count,
        vertices: mesh.vertex_count(),
        area,
        volume,
    }
}

/// Edges where the surface folds by more than `threshold_degrees`, open edges,
/// and edges between different materials — the same rule as three.js
/// EdgesGeometry, without its per-frame JS cost.
fn feature_edges(
    mesh: &Mesh,
    normals: &[[f32; 3]],
    threshold_degrees: f32,
) -> (Vec<f32>, Vec<u32>) {
    use std::collections::HashMap;
    let cos_limit = threshold_degrees.to_radians().cos();
    let tri_count = mesh.triangle_count();
    let mut adjacent: HashMap<(u32, u32), (u32, u32)> = HashMap::with_capacity(tri_count * 2);
    for t in 0..tri_count {
        for c in 0..3 {
            let a = mesh.indices[t * 3 + c];
            let b = mesh.indices[t * 3 + (c + 1) % 3];
            let key = if a < b { (a, b) } else { (b, a) };
            adjacent
                .entry(key)
                .and_modify(|e| e.1 = t as u32)
                .or_insert((t as u32, u32::MAX));
        }
    }

    // Bucket by the material of the first face so hiding a part hides its edges.
    let slots = mesh.palette.len().max(1);
    let mut buckets: Vec<Vec<f32>> = vec![Vec::new(); slots];
    let material = |t: u32| mesh.materials.get(t as usize).copied().unwrap_or(0) as usize;
    for (&(a, b), &(f0, f1)) in &adjacent {
        let keep = f1 == u32::MAX
            || material(f0) != material(f1)
            || dot(normals[f0 as usize], normals[f1 as usize]) <= cos_limit;
        if !keep {
            continue;
        }
        let bucket = &mut buckets[material(f0).min(slots - 1)];
        for v in [a, b] {
            let v = v as usize * 3;
            bucket.extend_from_slice(&mesh.positions[v..v + 3]);
        }
    }

    let mut edges = Vec::new();
    let mut ranges = Vec::new();
    for (slot, bucket) in buckets.into_iter().enumerate() {
        if bucket.is_empty() {
            continue;
        }
        ranges.extend_from_slice(&[
            slot as u32,
            (edges.len() / 3) as u32,
            (bucket.len() / 3) as u32,
        ]);
        edges.extend(bucket);
    }
    (edges, ranges)
}

/// Face normals plus surface area and signed volume in one pass.
fn face_data(mesh: &Mesh) -> (Vec<[f32; 3]>, f32, f32) {
    let tri_count = mesh.triangle_count();
    let mut normals = Vec::with_capacity(tri_count);
    let mut area = 0.0f64;
    let mut volume = 0.0f64;
    for t in 0..tri_count {
        let [a, b, c] = corners(mesh, t);
        let ab = sub(b, a);
        let ac = sub(c, a);
        let cr = cross(ab, ac);
        let len = (cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2]).sqrt();
        area += 0.5 * len as f64;
        volume += (dot(a, cross(b, c)) / 6.0) as f64;
        normals.push(if len > 0.0 {
            [cr[0] / len, cr[1] / len, cr[2] / len]
        } else {
            [0.0, 0.0, 1.0]
        });
    }
    (normals, area as f32, volume.abs() as f32)
}

fn corners(mesh: &Mesh, t: usize) -> [[f32; 3]; 3] {
    let mut out = [[0.0f32; 3]; 3];
    for (c, slot) in out.iter_mut().enumerate() {
        let vi = mesh.indices[t * 3 + c] as usize;
        *slot = [
            mesh.positions[vi * 3],
            mesh.positions[vi * 3 + 1],
            mesh.positions[vi * 3 + 2],
        ];
    }
    out
}

fn corner_angle(mesh: &Mesh, t: usize, vertex: usize) -> f32 {
    let idx = (0..3).find(|&c| mesh.indices[t * 3 + c] as usize == vertex);
    let Some(i) = idx else { return 0.0 };
    let p = corners(mesh, t);
    let a = p[i];
    let b = p[(i + 1) % 3];
    let c = p[(i + 2) % 3];
    let (u, v) = (normalize(sub(b, a)), normalize(sub(c, a)));
    match (u, v) {
        (Some(u), Some(v)) => dot(u, v).clamp(-1.0, 1.0).acos(),
        _ => 0.0,
    }
}

/// CSR vertex -> incident faces map.
struct Adjacency {
    offsets: Vec<u32>,
    faces: Vec<u32>,
}

impl Adjacency {
    fn build(mesh: &Mesh) -> Self {
        let v = mesh.vertex_count();
        let mut counts = vec![0u32; v + 1];
        for &i in &mesh.indices {
            counts[i as usize + 1] += 1;
        }
        for i in 1..counts.len() {
            counts[i] += counts[i - 1];
        }
        let offsets = counts.clone();
        let mut cursor = counts;
        let mut faces = vec![0u32; mesh.indices.len()];
        for (t, tri) in mesh.indices.as_chunks::<3>().0.iter().enumerate() {
            for &vi in tri {
                let slot = cursor[vi as usize] as usize;
                faces[slot] = t as u32;
                cursor[vi as usize] += 1;
            }
        }
        Adjacency { offsets, faces }
    }

    fn faces_of(&self, vertex: usize) -> &[u32] {
        let start = self.offsets[vertex] as usize;
        let end = self.offsets[vertex + 1] as usize;
        &self.faces[start..end]
    }
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn normalize(v: [f32; 3]) -> Option<[f32; 3]> {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    (len > 1e-12).then(|| [v[0] / len, v[1] / len, v[2] / len])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_cube() -> Mesh {
        // 12 triangles, outward winding
        let p = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
            [1.0, 0.0, 1.0],
            [1.0, 1.0, 1.0],
            [0.0, 1.0, 1.0],
        ];
        let tris: [[u32; 3]; 12] = [
            [0, 2, 1],
            [0, 3, 2],
            [4, 5, 6],
            [4, 6, 7],
            [0, 1, 5],
            [0, 5, 4],
            [1, 2, 6],
            [1, 6, 5],
            [2, 3, 7],
            [2, 7, 6],
            [3, 0, 4],
            [3, 4, 7],
        ];
        Mesh {
            positions: p.iter().flatten().copied().collect(),
            indices: tris.iter().flatten().copied().collect(),
            materials: vec![0; 12],
            palette: vec![[255, 0, 0, 255]],
        }
    }

    #[test]
    fn mass_properties_and_creases() {
        let data = build(&unit_cube(), 30.0);
        assert_eq!(data.triangles, 12);
        assert!((data.volume - 1.0).abs() < 1e-5, "volume {}", data.volume);
        assert!((data.area - 6.0).abs() < 1e-5, "area {}", data.area);
        // A 90 degree corner must stay sharp: every normal is axis aligned.
        for n in data.normals.as_chunks::<3>().0 {
            let m = n.iter().map(|c| c.abs()).fold(0.0f32, f32::max);
            assert!(
                (m - 1.0).abs() < 1e-5,
                "normal was smoothed across a crease: {n:?}"
            );
        }
        assert_eq!(data.palette[0], "#ff0000");
        // A cube has 12 feature edges (the face diagonals are coplanar).
        assert_eq!(data.edges.len(), 12 * 6);
        assert_eq!(data.ranges, vec![0, 0, 36]);
    }
}
