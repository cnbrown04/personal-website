//! Render planning, ported from the old axum server: which OpenSCAD runs a
//! parameter set needs, their `-D` arguments, and the cache keys. Runs in the
//! browser now; the OpenSCAD runs themselves happen in Web Workers.
//!
//! A model can declare pieces with a `mv_part` dropdown (`"all"` plus part
//! names) and, per part, an `mv_ignore_<part>` list of parameters that piece
//! does not use. Each part is rendered separately and cached under a key that
//! leaves out its ignored parameters, so e.g. moving a divider re-renders only
//! the dividers.

use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashSet;

use crate::customizer::{ParamKind, Schema, is_identifier};

/// One renderable piece and the parameters it ignores.
#[derive(Debug, Clone)]
pub struct Part {
    pub name: String,
    pub ignores: HashSet<String>,
}

pub fn part_plan(schema: &Schema) -> Option<Vec<Part>> {
    let selector = schema.params.iter().find(|p| p.name == "mv_part")?;
    let parts: Vec<Part> = selector
        .options
        .iter()
        .filter_map(|o| o.value.as_str())
        .filter(|name| *name != "all")
        .map(|name| Part {
            name: name.to_string(),
            ignores: schema
                .params
                .iter()
                .find(|p| p.name == format!("mv_ignore_{name}") && p.kind == ParamKind::Vector)
                .and_then(|p| p.default.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect();
    (parts.len() >= 2).then_some(parts)
}

/// One OpenSCAD run: its cache key and command-line `-D` arguments.
#[derive(Debug, Serialize)]
pub struct Job {
    pub part: String,
    pub key: String,
    pub args: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Plan {
    /// Key for the merged view of all parts.
    pub view_key: String,
    pub jobs: Vec<Job>,
    /// `uploads/<hash>.<ext>` files the model will `import()`.
    pub uploads: Vec<String>,
}

pub fn plan(
    source_hash: &str,
    schema: &Schema,
    params: &Map<String, Value>,
    quality: Option<f64>,
) -> Result<Plan, String> {
    check_param_paths(params)?;
    let view_key = cache_key(source_hash, params, "3mf", quality);
    let jobs = match part_plan(schema) {
        Some(parts) => parts
            .iter()
            .map(|part| {
                let mut scoped: Map<String, Value> = params
                    .iter()
                    .filter(|(k, _)| !part.ignores.contains(*k) && !k.starts_with("mv_"))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                scoped.insert("mv_part".into(), Value::String(part.name.clone()));
                Ok(Job {
                    part: part.name.clone(),
                    key: cache_key(source_hash, &scoped, "3mf", quality),
                    args: define_args(&scoped, quality)?,
                })
            })
            .collect::<Result<Vec<_>, String>>()?,
        None => vec![Job {
            part: "model".into(),
            key: view_key.clone(),
            args: define_args(params, quality)?,
        }],
    };
    Ok(Plan {
        view_key,
        jobs,
        uploads: upload_paths(params),
    })
}

/// `-D name=value` arguments for every parameter, plus the `$fn` override.
///
/// Parameter names must be plain identifiers: they are spliced into OpenSCAD
/// source, and a shared link should not be able to smuggle in code.
pub fn define_args(
    params: &Map<String, Value>,
    fn_override: Option<f64>,
) -> Result<Vec<String>, String> {
    let mut args = Vec::with_capacity(params.len() * 2 + 2);
    for (name, value) in params {
        if !is_identifier(name) {
            return Err(format!("“{name}” is not a valid parameter name"));
        }
        if let Some(literal) = scad_literal(value) {
            args.push("-D".into());
            args.push(format!("{name}={literal}"));
        }
    }
    if let Some(fnv) = fn_override {
        args.push("-D".into());
        args.push(format!("$fn={}", fnv.max(3.0).round()));
    }
    Ok(args)
}

/// Render a JSON value as an OpenSCAD literal for `-D`.
pub fn scad_literal(value: &Value) -> Option<String> {
    Some(match value {
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"")),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().filter_map(scad_literal).collect();
            if parts.len() != items.len() {
                return None;
            }
            format!("[{}]", parts.join(","))
        }
        Value::Null | Value::Object(_) => return None,
    })
}

/// Stable cache key for a render: file contents + parameters + knobs.
pub fn cache_key(
    source_hash: &str,
    params: &Map<String, Value>,
    format: &str,
    fn_override: Option<f64>,
) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(source_hash.as_bytes());
    hasher.update(format.as_bytes());
    hasher.update(format!("{fn_override:?}").as_bytes());
    let mut keys: Vec<&String> = params.keys().collect();
    keys.sort();
    for k in keys {
        hasher.update(k.as_bytes());
        hasher.update(b"=");
        hasher.update(canonical(&params[k]).as_bytes());
        hasher.update(b";");
    }
    hasher.finalize().to_hex().to_string()
}

/// JSON text with numbers normalised, so 70, 70.0 and 7e1 share a cache entry.
fn canonical(value: &Value) -> String {
    match value {
        Value::Number(n) => match n.as_f64() {
            Some(f) if f.fract() == 0.0 && f.abs() < 1e15 => format!("{}", f as i64),
            Some(f) => format!("{f}"),
            None => n.to_string(),
        },
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        other => other.to_string(),
    }
}

/// `uploads/<64 hex>.stl|3mf` and nothing else.
pub fn is_upload_path(s: &str) -> bool {
    let Some(rest) = s.strip_prefix("uploads/") else {
        return false;
    };
    let Some((hash, ext)) = rest.split_once('.') else {
        return false;
    };
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && matches!(ext, "stl" | "3mf")
}

/// Parameters flow into OpenSCAD `import()`; any string that looks like a path
/// must name an uploaded file.
pub fn check_param_paths(params: &Map<String, Value>) -> Result<(), String> {
    fn walk(v: &Value) -> Result<(), String> {
        match v {
            Value::String(s) if (s.contains('/') || s.contains('\\')) && !is_upload_path(s) => {
                Err(format!("“{s}” is not an uploaded file"))
            }
            Value::Array(items) => items.iter().try_for_each(walk),
            _ => Ok(()),
        }
    }
    params.values().try_for_each(walk)
}

fn upload_paths(params: &Map<String, Value>) -> Vec<String> {
    fn walk(v: &Value, out: &mut Vec<String>) {
        match v {
            Value::String(s) if is_upload_path(s) && !out.contains(s) => out.push(s.clone()),
            Value::Array(items) => items.iter().for_each(|i| walk(i, out)),
            _ => {}
        }
    }
    let mut out = Vec::new();
    params.values().for_each(|v| walk(v, &mut out));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn map(v: Value) -> Map<String, Value> {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn only_uploaded_paths_are_allowed() {
        let good = format!("uploads/{}.stl", "a".repeat(64));
        assert!(is_upload_path(&good));
        assert!(!is_upload_path("uploads/../../etc/passwd"));
        assert!(!is_upload_path("/etc/passwd"));
        let mut params = map(json!({ "tools": [[good, 1, 2]], "config": "extra wide" }));
        assert!(check_param_paths(&params).is_ok());
        assert_eq!(upload_paths(&params), vec![good]);
        params.insert("evil".into(), json!([["../secret.stl"]]));
        assert!(check_param_paths(&params).is_err());
    }

    #[test]
    fn define_args_quote_strings_and_reject_code_in_names() {
        let args = define_args(
            &map(json!({ "w": 70, "label": "a\"b", "on": true, "v": [1, 2] })),
            Some(32.4),
        )
        .unwrap();
        assert!(args.contains(&"w=70".to_string()));
        assert!(args.contains(&"label=\"a\\\"b\"".to_string()));
        assert!(args.contains(&"v=[1,2]".to_string()));
        assert_eq!(args[args.len() - 1], "$fn=32");
        assert!(define_args(&map(json!({ "x=1;cube(9e9)//": 1 })), None).is_err());
    }

    #[test]
    fn cache_keys_ignore_number_spelling_and_key_order() {
        let a = cache_key("h", &map(json!({ "a": 70, "b": 1.5 })), "3mf", None);
        let b = cache_key("h", &map(json!({ "b": 1.5, "a": 70.0 })), "3mf", None);
        assert_eq!(a, b);
        assert_ne!(
            a,
            cache_key("h", &map(json!({ "a": 71, "b": 1.5 })), "3mf", None)
        );
    }

    #[test]
    fn bundled_model_plans_one_job_per_part() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../model/clamshell.scad");
        let src = std::fs::read_to_string(path).unwrap();
        let schema = crate::customizer::parse(&src);
        let mut params = Map::new();
        for p in &schema.params {
            params.insert(p.name.clone(), p.default.clone());
        }
        let first = plan("hash", &schema, &params, Some(32.0)).unwrap();
        let parts: Vec<_> = first.jobs.iter().map(|j| j.part.as_str()).collect();
        assert_eq!(parts, ["base", "lid", "dividers", "inserts", "gridfinity"]);
        // A divider change must not invalidate the base.
        let mut moved = params.clone();
        moved.insert("cells".into(), json!([]));
        let replanned = plan("hash", &schema, &moved, Some(32.0)).unwrap();
        assert_eq!(first.jobs[0].key, replanned.jobs[0].key);
        assert_ne!(first.view_key, replanned.view_key);
    }
}
