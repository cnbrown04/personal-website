//! `MVM1`: a flat little-endian mesh container. The server emits it, the wasm
//! module decodes it straight into typed arrays — no JSON, no re-parsing.
//!
//! ```text
//! magic "MVM1" | u32 version | u32 verts | u32 tris | u32 palette
//! f32[3*verts] positions
//! u32[3*tris]  indices
//! u16[tris]    material slot per triangle  (padded to 4 bytes)
//! u8[4*palette] rgba
//! ```

use super::{Mesh, MeshError, Result};

pub const MAGIC: &[u8; 4] = b"MVM1";
pub const VERSION: u32 = 1;
pub const HEADER_LEN: usize = 20;

pub fn encode(mesh: &Mesh) -> Vec<u8> {
    let v = mesh.vertex_count();
    let t = mesh.triangle_count();
    let p = mesh.palette.len();
    let mut out = Vec::with_capacity(HEADER_LEN + v * 12 + t * 14 + p * 4);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&VERSION.to_le_bytes());
    out.extend_from_slice(&(v as u32).to_le_bytes());
    out.extend_from_slice(&(t as u32).to_le_bytes());
    out.extend_from_slice(&(p as u32).to_le_bytes());
    for f in &mesh.positions {
        out.extend_from_slice(&f.to_le_bytes());
    }
    for i in &mesh.indices {
        out.extend_from_slice(&i.to_le_bytes());
    }
    for m in &mesh.materials {
        out.extend_from_slice(&m.to_le_bytes());
    }
    while out.len() % 4 != 0 {
        out.push(0);
    }
    for c in &mesh.palette {
        out.extend_from_slice(c);
    }
    out
}

pub fn decode(bytes: &[u8]) -> Result<Mesh> {
    if bytes.len() < HEADER_LEN || &bytes[0..4] != MAGIC {
        return Err(MeshError::Format("not an MVM1 buffer".into()));
    }
    let u32_at =
        |o: usize| u32::from_le_bytes([bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]]);
    if u32_at(4) != VERSION {
        return Err(MeshError::Format("unsupported MVM version".into()));
    }
    let (v, t, p) = (u32_at(8) as usize, u32_at(12) as usize, u32_at(16) as usize);

    let mut off = HEADER_LEN;
    let need = v * 12 + t * 12 + t * 2;
    if bytes.len() < off + need {
        return Err(MeshError::Format("truncated MVM buffer".into()));
    }

    let mut positions = Vec::with_capacity(v * 3);
    for i in 0..v * 3 {
        let o = off + i * 4;
        positions.push(f32::from_le_bytes([
            bytes[o],
            bytes[o + 1],
            bytes[o + 2],
            bytes[o + 3],
        ]));
    }
    off += v * 12;

    let mut indices = Vec::with_capacity(t * 3);
    for i in 0..t * 3 {
        let o = off + i * 4;
        indices.push(u32_at(o).min(v.saturating_sub(1) as u32));
    }
    off += t * 12;

    let mut materials = Vec::with_capacity(t);
    for i in 0..t {
        let o = off + i * 2;
        materials.push(u16::from_le_bytes([bytes[o], bytes[o + 1]]));
    }
    off += t * 2;
    off += (4 - off % 4) % 4;

    let mut palette = Vec::with_capacity(p);
    for i in 0..p {
        let o = off + i * 4;
        if o + 4 <= bytes.len() {
            palette.push([bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]]);
        }
    }
    if palette.is_empty() {
        palette.push([200, 200, 205, 255]);
    }

    Ok(Mesh {
        positions,
        indices,
        materials,
        palette,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let mesh = Mesh {
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            indices: vec![0, 1, 2],
            materials: vec![0],
            palette: vec![[1, 2, 3, 255]],
        };
        let back = decode(&encode(&mesh)).unwrap();
        assert_eq!(back.positions, mesh.positions);
        assert_eq!(back.indices, mesh.indices);
        assert_eq!(back.materials, mesh.materials);
        assert_eq!(back.palette, mesh.palette);
    }
}
