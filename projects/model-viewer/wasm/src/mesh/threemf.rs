//! Minimal 3MF reader. We only need what OpenSCAD writes: one model file,
//! basematerials for color, objects with a plain triangle mesh, and a build
//! section whose items may carry a transform.

use quick_xml::Reader;
use quick_xml::events::{Event, attributes::Attributes};
use std::collections::HashMap;

use super::{Mesh, MeshError, Result, read_zip_entry};

#[derive(Default)]
struct RawObject {
    positions: Vec<f32>,
    indices: Vec<u32>,
    /// (materials group id, index) per triangle; falls back to the object default
    tri_mat: Vec<Option<(u32, u32)>>,
    default_mat: Option<(u32, u32)>,
}

pub fn parse(bytes: &[u8]) -> Result<Mesh> {
    let xml = read_zip_entry(bytes, ".model")?;
    let xml = String::from_utf8_lossy(&xml).into_owned();
    parse_model_xml(&xml)
}

pub fn parse_model_xml(xml: &str) -> Result<Mesh> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    // group id -> rgba entries
    let mut material_groups: HashMap<u32, Vec<[u8; 4]>> = HashMap::new();
    let mut objects: HashMap<u32, RawObject> = HashMap::new();
    let mut items: Vec<(u32, [f32; 12])> = Vec::new();

    let mut cur_group: Option<u32> = None;
    let mut cur_object: Option<u32> = None;
    let mut in_build = false;

    let mut buf = Vec::new();
    loop {
        let ev = reader.read_event_into(&mut buf)?;
        match ev {
            Event::Eof => break,
            Event::Start(ref e) | Event::Empty(ref e) => {
                let empty = matches!(ev, Event::Empty(_));
                let name = local_name(e.name().as_ref());
                match name.as_str() {
                    "basematerials" | "colorgroup" => {
                        let id = attr_u32(e.attributes(), "id").unwrap_or(0);
                        material_groups.entry(id).or_default();
                        if !empty {
                            cur_group = Some(id);
                        }
                    }
                    "base" | "color" => {
                        let hex = attr(e.attributes(), "displaycolor")
                            .or_else(|| attr(e.attributes(), "color"))
                            .unwrap_or_default();
                        if let Some(g) = cur_group {
                            material_groups.entry(g).or_default().push(parse_hex(&hex));
                        }
                    }
                    "object" => {
                        let id = attr_u32(e.attributes(), "id").unwrap_or(0);
                        let pid = attr_u32(e.attributes(), "pid");
                        let pindex = attr_u32(e.attributes(), "pindex").unwrap_or(0);
                        let obj = RawObject {
                            default_mat: pid.map(|p| (p, pindex)),
                            ..Default::default()
                        };
                        objects.insert(id, obj);
                        if !empty {
                            cur_object = Some(id);
                        }
                    }
                    "vertex" => {
                        if let Some(obj) = cur_object.and_then(|id| objects.get_mut(&id)) {
                            let mut a = e.attributes();
                            let (mut x, mut y, mut z) = (0.0, 0.0, 0.0);
                            while let Some(Ok(at)) = a.next() {
                                let v: f32 =
                                    String::from_utf8_lossy(&at.value).parse().unwrap_or(0.0);
                                match local_name(at.key.as_ref()).as_str() {
                                    "x" => x = v,
                                    "y" => y = v,
                                    "z" => z = v,
                                    _ => {}
                                }
                            }
                            obj.positions.extend_from_slice(&[x, y, z]);
                        }
                    }
                    "triangle" => {
                        if let Some(obj) = cur_object.and_then(|id| objects.get_mut(&id)) {
                            let mut a = e.attributes();
                            let (mut v1, mut v2, mut v3) = (0u32, 0u32, 0u32);
                            let (mut pid, mut p1) = (None, None);
                            while let Some(Ok(at)) = a.next() {
                                let raw = String::from_utf8_lossy(&at.value);
                                match local_name(at.key.as_ref()).as_str() {
                                    "v1" => v1 = raw.parse().unwrap_or(0),
                                    "v2" => v2 = raw.parse().unwrap_or(0),
                                    "v3" => v3 = raw.parse().unwrap_or(0),
                                    "pid" => pid = raw.parse::<u32>().ok(),
                                    "p1" => p1 = raw.parse::<u32>().ok(),
                                    _ => {}
                                }
                            }
                            obj.indices.extend_from_slice(&[v1, v2, v3]);
                            obj.tri_mat.push(match (pid, p1) {
                                (Some(g), Some(i)) => Some((g, i)),
                                (None, Some(i)) => obj.default_mat.map(|(g, _)| (g, i)),
                                _ => None,
                            });
                        }
                    }
                    "build" => in_build = !empty,
                    "item" if in_build => {
                        let oid = attr_u32(e.attributes(), "objectid").unwrap_or(0);
                        let t = attr(e.attributes(), "transform")
                            .and_then(|s| parse_transform(&s))
                            .unwrap_or(IDENTITY);
                        items.push((oid, t));
                    }
                    _ => {}
                }
            }
            Event::End(ref e) => match local_name(e.name().as_ref()).as_str() {
                "basematerials" | "colorgroup" => cur_group = None,
                "object" => cur_object = None,
                "build" => in_build = false,
                _ => {}
            },
            _ => {}
        }
        buf.clear();
    }

    if items.is_empty() {
        items = objects.keys().map(|&id| (id, IDENTITY)).collect();
        items.sort_by_key(|(id, _)| *id);
    }

    // Flatten every build item into one mesh with a shared palette.
    let mut mesh = Mesh::default();
    let mut palette_index: HashMap<(u32, u32), u16> = HashMap::new();
    let mut fallback: Option<u16> = None;

    for (oid, xf) in items {
        let Some(obj) = objects.get(&oid) else {
            continue;
        };
        let base = (mesh.positions.len() / 3) as u32;
        for p in obj.positions.as_chunks::<3>().0 {
            let v = apply(&xf, [p[0], p[1], p[2]]);
            mesh.positions.extend_from_slice(&v);
        }
        for (t, tri) in obj.indices.as_chunks::<3>().0.iter().enumerate() {
            mesh.indices
                .extend_from_slice(&[base + tri[0], base + tri[1], base + tri[2]]);
            let key = obj.tri_mat.get(t).copied().flatten().or(obj.default_mat);
            let slot = match key {
                Some(k) => *palette_index.entry(k).or_insert_with(|| {
                    let rgba = material_groups
                        .get(&k.0)
                        .and_then(|g| g.get(k.1 as usize))
                        .copied()
                        .unwrap_or([200, 200, 205, 255]);
                    mesh.palette.push(rgba);
                    (mesh.palette.len() - 1) as u16
                }),
                None => *fallback.get_or_insert_with(|| {
                    mesh.palette.push([200, 200, 205, 255]);
                    (mesh.palette.len() - 1) as u16
                }),
            };
            mesh.materials.push(slot);
        }
    }

    if mesh.indices.is_empty() {
        return Err(MeshError::Format("3MF contained no triangles".into()));
    }
    mesh.compact_palette();
    Ok(mesh)
}

const IDENTITY: [f32; 12] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

fn apply(m: &[f32; 12], v: [f32; 3]) -> [f32; 3] {
    [
        m[0] * v[0] + m[3] * v[1] + m[6] * v[2] + m[9],
        m[1] * v[0] + m[4] * v[1] + m[7] * v[2] + m[10],
        m[2] * v[0] + m[5] * v[1] + m[8] * v[2] + m[11],
    ]
}

fn parse_transform(s: &str) -> Option<[f32; 12]> {
    let vals: Vec<f32> = s
        .split_whitespace()
        .filter_map(|t| t.parse().ok())
        .collect();
    (vals.len() == 12).then(|| {
        let mut out = IDENTITY;
        out.copy_from_slice(&vals);
        out
    })
}

fn local_name(raw: &[u8]) -> String {
    let s = String::from_utf8_lossy(raw);
    s.rsplit(':').next().unwrap_or("").to_ascii_lowercase()
}

fn attr(mut attrs: Attributes, want: &str) -> Option<String> {
    while let Some(Ok(a)) = attrs.next() {
        if local_name(a.key.as_ref()) == want {
            return Some(String::from_utf8_lossy(&a.value).into_owned());
        }
    }
    None
}

fn attr_u32(attrs: Attributes, want: &str) -> Option<u32> {
    attr(attrs, want).and_then(|v| v.parse().ok())
}

/// `#RRGGBB` or `#RRGGBBAA`. OpenSCAD writes alpha as 00 for opaque colors,
/// so a fully transparent alpha is treated as opaque.
fn parse_hex(s: &str) -> [u8; 4] {
    let h = s.trim_start_matches('#');
    let byte = |i: usize| u8::from_str_radix(h.get(i..i + 2).unwrap_or("ff"), 16).unwrap_or(255);
    if h.len() < 6 {
        return [200, 200, 205, 255];
    }
    let a = if h.len() >= 8 { byte(6) } else { 255 };
    [byte(0), byte(2), byte(4), if a == 0 { 255 } else { a }]
}
