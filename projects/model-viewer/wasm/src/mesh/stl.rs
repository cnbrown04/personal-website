//! Binary/ASCII STL reader, used when a render falls back to STL output.

use super::{Mesh, MeshError, Result};
use std::collections::HashMap;

pub fn parse(bytes: &[u8]) -> Result<Mesh> {
    if is_ascii_stl(bytes) {
        parse_ascii(bytes)
    } else {
        parse_binary(bytes)
    }
}

fn is_ascii_stl(bytes: &[u8]) -> bool {
    if bytes.len() < 84 {
        return true;
    }
    let declared = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    let expected = 84 + declared * 50;
    // A binary STL's size follows exactly from its triangle count.
    !(expected == bytes.len()) && bytes.starts_with(b"solid")
}

fn parse_binary(bytes: &[u8]) -> Result<Mesh> {
    if bytes.len() < 84 {
        return Err(MeshError::Format("STL too short".into()));
    }
    let count = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    if bytes.len() < 84 + count * 50 {
        return Err(MeshError::Format("truncated binary STL".into()));
    }
    let mut tris = Vec::with_capacity(count * 9);
    for t in 0..count {
        let base = 84 + t * 50 + 12; // skip the face normal
        for i in 0..9 {
            let o = base + i * 4;
            tris.push(f32::from_le_bytes([
                bytes[o],
                bytes[o + 1],
                bytes[o + 2],
                bytes[o + 3],
            ]));
        }
    }
    Ok(weld(tris))
}

fn parse_ascii(bytes: &[u8]) -> Result<Mesh> {
    let text = String::from_utf8_lossy(bytes);
    let mut tris = Vec::new();
    for line in text.lines() {
        let line = line.trim_start();
        if let Some(rest) = line.strip_prefix("vertex ") {
            let v: Vec<f32> = rest
                .split_whitespace()
                .filter_map(|t| t.parse().ok())
                .collect();
            if v.len() == 3 {
                tris.extend_from_slice(&v);
            }
        }
    }
    if tris.len() < 9 {
        return Err(MeshError::Format("ASCII STL contained no triangles".into()));
    }
    Ok(weld(tris))
}

/// Welds identical vertices so normal smoothing has real adjacency to work with.
fn weld(flat: Vec<f32>) -> Mesh {
    let mut mesh = Mesh {
        palette: vec![[200, 200, 205, 255]],
        ..Default::default()
    };
    let mut seen: HashMap<[u32; 3], u32> = HashMap::with_capacity(flat.len() / 3);
    for v in flat.as_chunks::<3>().0 {
        let key = [v[0].to_bits(), v[1].to_bits(), v[2].to_bits()];
        let idx = *seen.entry(key).or_insert_with(|| {
            mesh.positions.extend_from_slice(v);
            (mesh.positions.len() / 3 - 1) as u32
        });
        mesh.indices.push(idx);
    }
    mesh.materials = vec![0; mesh.indices.len() / 3];
    mesh
}
