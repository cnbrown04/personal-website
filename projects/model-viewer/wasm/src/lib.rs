//! Model viewer core, compiled to WebAssembly: the OpenSCAD Customizer
//! parser, render planning and caching keys, and mesh decoding (3MF/STL in,
//! three.js-ready buffers out). OpenSCAD itself runs in Web Workers.

mod customizer;
mod decode;
mod mesh;
mod pipeline;

use serde_json::{Map, Value};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

pub use decode::{MeshData, decode_mesh, decode_model_file};

thread_local! {
    /// The schema for the last source hash; parsing is cheap but runs per render.
    static SCHEMA: RefCell<Option<(String, customizer::Schema)>> = const { RefCell::new(None) };
}

fn params_from_json(json: &str) -> Result<Map<String, Value>, JsError> {
    serde_json::from_str(json).map_err(|e| JsError::new(&format!("bad parameters: {e}")))
}

/// blake3 hex digest; names sources (cache keys) and uploads (`uploads/<hash>.stl`).
#[wasm_bindgen]
pub fn hash_hex(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

/// The Customizer schema of a .scad source, as JSON.
#[wasm_bindgen]
pub fn parse_schema(source: &str) -> Result<String, JsError> {
    serde_json::to_string(&customizer::parse(source)).map_err(|e| JsError::new(&e.to_string()))
}

/// Plans a viewer render: `{ view_key, jobs: [{ part, key, args }], uploads }`.
#[wasm_bindgen]
pub fn plan_render(
    source: &str,
    params_json: &str,
    quality: Option<f64>,
) -> Result<String, JsError> {
    let params = params_from_json(params_json)?;
    let hash = hash_hex(source.as_bytes());
    SCHEMA.with_borrow_mut(|slot| {
        if slot.as_ref().is_none_or(|(h, _)| *h != hash) {
            *slot = Some((hash.clone(), customizer::parse(source)));
        }
        let (_, schema) = slot.as_ref().expect("just filled");
        let plan = pipeline::plan(&hash, schema, &params, quality).map_err(|e| JsError::new(&e))?;
        serde_json::to_string(&plan).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// `-D` arguments for a whole-model export (every part in one file).
#[wasm_bindgen]
pub fn export_args(params_json: &str, quality: Option<f64>) -> Result<Vec<String>, JsError> {
    let params = params_from_json(params_json)?;
    pipeline::check_param_paths(&params).map_err(|e| JsError::new(&e))?;
    pipeline::define_args(&params, quality).map_err(|e| JsError::new(&e))
}

/// Converts one part's OpenSCAD 3MF output to a compact MVM1 buffer for caching.
/// Empty input (a part with no geometry) gives an empty mesh.
#[wasm_bindgen]
pub fn part_mesh(bytes: &[u8]) -> Result<Vec<u8>, JsError> {
    if bytes.is_empty() {
        return Ok(mesh::encode(&mesh::Mesh::default()));
    }
    let mut m = mesh::parse_auto(bytes)
        .map_err(|e| JsError::new(&format!("parsing OpenSCAD output: {e}")))?;
    m.compact_palette();
    Ok(mesh::encode(&m))
}

/// Merges part MVM1 buffers into one view mesh, sharing identical colors.
#[wasm_bindgen]
pub fn merge_parts(parts: js_sys::Array) -> Result<Vec<u8>, JsError> {
    let mut merged = mesh::Mesh::default();
    for part in parts.iter() {
        let bytes = js_sys::Uint8Array::new(&part).to_vec();
        let m = mesh::decode(&bytes).map_err(|e| JsError::new(&e.to_string()))?;
        merged.append(&m);
    }
    if merged.indices.is_empty() {
        return Err(JsError::new("the model produced no geometry"));
    }
    merged.compact_palette();
    Ok(mesh::encode(&merged))
}

/// Summary of an uploaded tool mesh: `{ hash, ext, triangles, bbox }`.
#[wasm_bindgen]
pub fn inspect_upload(bytes: &[u8]) -> Result<String, JsError> {
    let m = mesh::parse_auto(bytes)
        .map_err(|e| JsError::new(&format!("not a readable STL or 3MF: {e}")))?;
    let (min, max) = m.bounds();
    let info = serde_json::json!({
        "hash": hash_hex(bytes),
        "ext": if bytes.starts_with(b"PK") { "3mf" } else { "stl" },
        "triangles": m.triangle_count(),
        "bbox": [min[0], min[1], min[2], max[0], max[1], max[2]],
    });
    Ok(info.to_string())
}
