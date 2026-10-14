//! Shared mesh plumbing: 3MF/STL import and the compact `MVM1` wire format
//! that the server sends to the browser and the wasm module decodes.

use std::io::{Cursor, Read};

pub mod mvm;
pub mod stl;
pub mod threemf;

pub use mvm::{decode, encode};

#[derive(Debug, thiserror::Error)]
pub enum MeshError {
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("xml error: {0}")]
    Xml(#[from] quick_xml::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Format(String),
}

pub type Result<T> = std::result::Result<T, MeshError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_offsets_indices_and_merges_palette() {
        let tri = |c: [u8; 4]| Mesh {
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            indices: vec![0, 1, 2],
            materials: vec![0],
            palette: vec![c],
        };
        let mut a = tri([255, 255, 255, 255]);
        a.append(&tri([1, 2, 3, 255]));
        a.append(&tri([255, 255, 255, 255]));
        assert_eq!(a.indices, vec![0, 1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(a.palette.len(), 2);
        assert_eq!(a.materials, vec![0, 1, 0]);
    }
}

/// An indexed triangle mesh with a per-triangle material index into `palette`.
#[derive(Debug, Default, Clone)]
pub struct Mesh {
    /// xyz triples
    pub positions: Vec<f32>,
    /// vertex indices, 3 per triangle
    pub indices: Vec<u32>,
    /// palette slot per triangle
    pub materials: Vec<u16>,
    /// rgba, 0-255
    pub palette: Vec<[u8; 4]>,
}

impl Mesh {
    pub fn vertex_count(&self) -> usize {
        self.positions.len() / 3
    }

    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    pub fn bounds(&self) -> ([f32; 3], [f32; 3]) {
        let mut min = [f32::INFINITY; 3];
        let mut max = [f32::NEG_INFINITY; 3];
        for p in self.positions.as_chunks::<3>().0 {
            for a in 0..3 {
                min[a] = min[a].min(p[a]);
                max[a] = max[a].max(p[a]);
            }
        }
        if !min[0].is_finite() {
            (([0.0; 3]), ([0.0; 3]))
        } else {
            (min, max)
        }
    }

    /// Appends another mesh, sharing palette entries of identical colour.
    pub fn append(&mut self, other: &Mesh) {
        let base = self.vertex_count() as u32;
        self.positions.extend_from_slice(&other.positions);
        self.indices.extend(other.indices.iter().map(|i| i + base));
        let remap: Vec<u16> = other
            .palette
            .iter()
            .map(|c| match self.palette.iter().position(|p| p == c) {
                Some(i) => i as u16,
                None => {
                    self.palette.push(*c);
                    (self.palette.len() - 1) as u16
                }
            })
            .collect();
        self.materials.extend(
            other
                .materials
                .iter()
                .map(|m| remap.get(*m as usize).copied().unwrap_or(0)),
        );
    }

    /// Drops palette entries no triangle references, remapping as it goes.
    pub fn compact_palette(&mut self) {
        let mut used = vec![false; self.palette.len()];
        for &m in &self.materials {
            if let Some(slot) = used.get_mut(m as usize) {
                *slot = true;
            }
        }
        let mut remap = vec![0u16; self.palette.len()];
        let mut kept: Vec<[u8; 4]> = Vec::new();
        for (i, is_used) in used.iter().enumerate() {
            if *is_used {
                remap[i] = kept.len() as u16;
                kept.push(self.palette[i]);
            }
        }
        if kept.is_empty() && !self.materials.is_empty() {
            kept.push([200, 200, 205, 255]);
        }
        for m in &mut self.materials {
            *m = remap.get(*m as usize).copied().unwrap_or(0);
        }
        self.palette = kept;
    }
}

/// Sniffs the container type and parses accordingly.
pub fn parse_auto(bytes: &[u8]) -> Result<Mesh> {
    if bytes.starts_with(b"PK") {
        threemf::parse(bytes)
    } else {
        stl::parse(bytes)
    }
}

pub(crate) fn read_zip_entry(bytes: &[u8], name_suffix: &str) -> Result<Vec<u8>> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))?;
    let idx = (0..zip.len()).find(|&i| {
        zip.by_index(i)
            .map(|f| f.name().to_ascii_lowercase().ends_with(name_suffix))
            .unwrap_or(false)
    });
    let idx = idx.ok_or_else(|| MeshError::Format(format!("no {name_suffix} in archive")))?;
    let mut out = Vec::new();
    zip.by_index(idx)?.read_to_end(&mut out)?;
    Ok(out)
}
