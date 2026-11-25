//! Parser for OpenSCAD's Customizer annotations.
//!
//! Recognises the same shapes the OpenSCAD GUI does: `/* [Group] */` section
//! banners, top-level `name = value;` assignments, and `// [..]` annotations
//! for ranges, dropdowns and max lengths. Everything after a `/* [Hidden] */`
//! banner is kept but flagged, so the UI can offer it behind an "advanced"
//! switch instead of throwing it away.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ParamKind {
    Bool,
    Number,
    String,
    Vector,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Option_ {
    pub value: Value,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Param {
    pub name: String,
    pub group: String,
    pub kind: ParamKind,
    pub default: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<Option_>,
    pub hidden: bool,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schema {
    pub groups: Vec<Group>,
    pub params: Vec<Param>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub includes: Vec<String>,
}

const GLOBAL: &str = "Parameters";
const HIDDEN: &str = "Hidden";

pub fn parse(source: &str) -> Schema {
    let mut groups: Vec<Group> = vec![Group {
        name: GLOBAL.into(),
        description: None,
        hidden: false,
    }];
    let mut params: Vec<Param> = Vec::new();
    let mut includes: Vec<String> = Vec::new();

    let mut current = GLOBAL.to_string();
    let mut current_hidden = false;
    let mut depth: i32 = 0;

    let lines: Vec<&str> = source.lines().collect();
    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        // Group banner, possibly spanning several lines.
        if depth == 0 && trimmed.starts_with("/*") {
            let mut block = String::new();
            let mut j = i;
            loop {
                block.push_str(lines[j]);
                block.push('\n');
                if lines[j].contains("*/") || j + 1 >= lines.len() {
                    break;
                }
                j += 1;
            }
            if let Some((name, desc)) = group_banner(&block) {
                current_hidden = name.eq_ignore_ascii_case(HIDDEN);
                current = if current_hidden { HIDDEN.into() } else { name };
                if !groups.iter().any(|g| g.name == current) {
                    groups.push(Group {
                        name: current.clone(),
                        description: desc,
                        hidden: current_hidden,
                    });
                }
            }
            i = j + 1;
            continue;
        }

        if let Some(rest) = trimmed
            .strip_prefix("include <")
            .or_else(|| trimmed.strip_prefix("use <"))
            && let Some(end) = rest.find('>')
        {
            includes.push(rest[..end].to_string());
        }

        // Only top-level assignments are customizer parameters.
        if depth == 0
            && !trimmed.starts_with("//")
            && !trimmed.starts_with("module ")
            && !trimmed.starts_with("function ")
            && let Some(p) = parse_assignment(line, &current, current_hidden, i + 1)
        {
            // A later assignment to the same name wins, as in OpenSCAD.
            if let Some(existing) = params.iter_mut().find(|e| e.name == p.name) {
                *existing = p;
            } else {
                params.push(p);
            }
        }

        depth += brace_delta(line);
        i += 1;
    }

    groups.retain(|g| g.name == GLOBAL || params.iter().any(|p| p.group == g.name));
    if !params.iter().any(|p| p.group == GLOBAL) {
        groups.retain(|g| g.name != GLOBAL);
    }
    Schema {
        groups,
        params,
        includes,
    }
}

/// `/* [Name] optional description */` -> ("Name", description)
fn group_banner(block: &str) -> Option<(String, Option<String>)> {
    let body = block
        .trim()
        .strip_prefix("/*")?
        .trim_end()
        .strip_suffix("*/")?;
    let body = body.trim_start();
    let body = body.strip_prefix('[')?;
    let close = body.find(']')?;
    let name = body[..close].trim().to_string();
    if name.is_empty() {
        return None;
    }
    let desc: String = body[close + 1..]
        .lines()
        .map(|l| l.trim())
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    Some((name, (!desc.is_empty()).then_some(desc)))
}

/// Counts braces/brackets outside strings and comments, to know when we have
/// left the top level of the file.
fn brace_delta(line: &str) -> i32 {
    let bytes = line.as_bytes();
    let mut delta = 0;
    let mut in_str = false;
    let mut k = 0;
    while k < bytes.len() {
        let c = bytes[k] as char;
        if in_str {
            if c == '\\' {
                k += 2;
                continue;
            }
            if c == '"' {
                in_str = false;
            }
        } else {
            match c {
                '"' => in_str = true,
                '/' if bytes.get(k + 1) == Some(&b'/') => break,
                '{' => delta += 1,
                '}' => delta -= 1,
                _ => {}
            }
        }
        k += 1;
    }
    delta
}

fn parse_assignment(line: &str, group: &str, hidden: bool, lineno: usize) -> Option<Param> {
    let (code, comment) = split_comment(line);
    let code = code.trim();
    let code = code.strip_suffix(';')?;
    let eq = find_assign_eq(code)?;
    let name = code[..eq].trim();
    if name.is_empty() || name.starts_with('$') || !is_identifier(name) {
        return None;
    }
    let raw_value = code[eq + 1..].trim();
    let (kind, default) = parse_value(raw_value)?;

    let mut p = Param {
        name: name.to_string(),
        group: group.to_string(),
        kind,
        default,
        description: None,
        min: None,
        max: None,
        step: None,
        max_length: None,
        options: Vec::new(),
        hidden,
        line: lineno,
    };
    apply_annotation(&mut p, comment.trim());
    Some(p)
}

fn split_comment(line: &str) -> (&str, &str) {
    let bytes = line.as_bytes();
    let mut in_str = false;
    let mut k = 0;
    while k < bytes.len() {
        let c = bytes[k] as char;
        if in_str {
            if c == '\\' {
                k += 2;
                continue;
            }
            if c == '"' {
                in_str = false;
            }
        } else if c == '"' {
            in_str = true;
        } else if c == '/' && bytes.get(k + 1) == Some(&b'/') {
            return (&line[..k], &line[k + 2..]);
        }
        k += 1;
    }
    (line, "")
}

fn find_assign_eq(code: &str) -> Option<usize> {
    let bytes = code.as_bytes();
    let mut in_str = false;
    let mut depth = 0;
    for (k, &b) in bytes.iter().enumerate() {
        let c = b as char;
        if in_str {
            if c == '"' {
                in_str = false;
            }
            continue;
        }
        match c {
            '"' => in_str = true,
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            '=' if depth == 0 => {
                let next = bytes.get(k + 1).copied().unwrap_or(b' ');
                let prev = if k == 0 { b' ' } else { bytes[k - 1] };
                if next != b'=' && !matches!(prev, b'=' | b'!' | b'<' | b'>') {
                    return Some(k);
                }
            }
            _ => {}
        }
    }
    None
}

pub(crate) fn is_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Literal values only: anything computed is a derived variable, not a knob.
fn parse_value(raw: &str) -> Option<(ParamKind, Value)> {
    match raw {
        "true" => return Some((ParamKind::Bool, json!(true))),
        "false" => return Some((ParamKind::Bool, json!(false))),
        _ => {}
    }
    if raw.starts_with('"') && raw.ends_with('"') && raw.len() >= 2 {
        let inner = &raw[1..raw.len() - 1];
        if inner.contains('"') {
            return None;
        }
        return Some((ParamKind::String, json!(inner)));
    }
    if let Ok(n) = raw.parse::<f64>() {
        return Some((ParamKind::Number, json!(n)));
    }
    if raw.starts_with('[') && raw.ends_with(']') {
        let inner = raw[1..raw.len() - 1].trim();
        if inner.is_empty() {
            return Some((ParamKind::Vector, Value::Array(Vec::new())));
        }
        let mut items = Vec::new();
        for part in inner.split(',') {
            let part = part.trim();
            if part.is_empty() {
                return None;
            }
            match part.parse::<f64>() {
                Ok(n) => items.push(json!(n)),
                Err(_) => {
                    if part.starts_with('"') && part.ends_with('"') && part.len() >= 2 {
                        items.push(json!(&part[1..part.len() - 1]));
                    } else if part == "true" || part == "false" {
                        items.push(json!(part == "true"));
                    } else {
                        return None;
                    }
                }
            }
        }
        return Some((ParamKind::Vector, Value::Array(items)));
    }
    None
}

/// `// [1:10]`, `// [1:0.5:10]`, `// [a, b, c]`, `// [0:foo, 1:bar]`, `// [20]`
fn apply_annotation(p: &mut Param, comment: &str) {
    let comment = comment.trim();
    if !comment.starts_with('[') {
        if !comment.is_empty() {
            p.description = Some(comment.to_string());
        }
        return;
    }
    let Some(close) = matching_bracket(comment) else {
        p.description = Some(comment.to_string());
        return;
    };
    let body = &comment[1..close];
    let tail = comment[close + 1..].trim();
    if !tail.is_empty() {
        p.description = Some(tail.to_string());
    }

    let is_range = body.contains(':')
        && !body.contains(',')
        && body.split(':').all(|t| t.trim().parse::<f64>().is_ok());

    if is_range {
        let nums: Vec<f64> = body
            .split(':')
            .filter_map(|t| t.trim().parse().ok())
            .collect();
        match nums.len() {
            2 => {
                p.min = Some(nums[0]);
                p.max = Some(nums[1]);
            }
            3 => {
                // OpenSCAD orders this min:step:max
                p.min = Some(nums[0]);
                p.step = Some(nums[1]);
                p.max = Some(nums[2]);
            }
            _ => {}
        }
        if p.step.is_none() {
            let span = p.max.unwrap_or(1.0) - p.min.unwrap_or(0.0);
            let integral = p.default.as_f64().map(|d| d.fract() == 0.0).unwrap_or(true);
            p.step = Some(if integral && span >= 1.0 {
                1.0
            } else {
                span / 100.0
            });
        }
        return;
    }

    if body.contains(',') {
        for item in split_top_level(body, ',') {
            let item = item.trim();
            if item.is_empty() {
                continue;
            }
            let (v, label) = match item.split_once(':') {
                Some((v, l)) => (v.trim(), l.trim().trim_matches('"').to_string()),
                None => (item, String::new()),
            };
            let unq = v.trim().trim_matches('"').to_string();
            let value = match (&p.kind, v.parse::<f64>()) {
                (ParamKind::Number, Ok(n)) => json!(n),
                _ => json!(unq.clone()),
            };
            let label = if label.is_empty() { unq } else { label };
            p.options.push(Option_ { value, label });
        }
        return;
    }

    // A single number is a max (or a max length for strings).
    if let Ok(n) = body.trim().parse::<f64>() {
        match p.kind {
            ParamKind::String => p.max_length = Some(n as usize),
            ParamKind::Number => {
                p.min = Some(0.0);
                p.max = Some(n);
                p.step = Some(if n.fract() == 0.0 { 1.0 } else { n / 100.0 });
            }
            _ => {}
        }
        return;
    }

    // A single quoted/bare token is a one-entry dropdown; treat as description.
    let only = body.trim().trim_matches('"');
    if !only.is_empty() {
        p.options.push(Option_ {
            value: json!(only),
            label: only.to_string(),
        });
    }
}

fn matching_bracket(s: &str) -> Option<usize> {
    let mut depth = 0;
    for (i, c) in s.char_indices() {
        match c {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn split_top_level(s: &str, sep: char) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_str = false;
    for c in s.chars() {
        match c {
            '"' => {
                in_str = !in_str;
                cur.push(c);
            }
            _ if c == sep && !in_str => {
                out.push(std::mem::take(&mut cur));
            }
            _ => cur.push(c),
        }
    }
    out.push(cur);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_groups_ranges_and_dropdowns() {
        let src = r#"
/* [Shape] */
config = "standard";  // ["standard", "extra tall", "custom"]
width = 70;        // [35:220]
fine = 1.5;        // [0:0.1:10] how fine
enabled = true;
splits = [];
/* [Hidden] */
secret = 3;
derived = width - 2;
module foo() { x = 5; }
"#;
        let s = parse(src);
        let by = |n: &str| s.params.iter().find(|p| p.name == n).cloned();

        let config = by("config").unwrap();
        assert_eq!(config.kind, ParamKind::String);
        assert_eq!(config.options.len(), 3);
        assert_eq!(config.group, "Shape");

        let width = by("width").unwrap();
        assert_eq!((width.min, width.max), (Some(35.0), Some(220.0)));

        let fine = by("fine").unwrap();
        assert_eq!(
            (fine.min, fine.step, fine.max),
            (Some(0.0), Some(0.1), Some(10.0))
        );
        assert_eq!(fine.description.as_deref(), Some("how fine"));

        assert_eq!(by("enabled").unwrap().kind, ParamKind::Bool);
        assert_eq!(by("splits").unwrap().default, json!([]));
        assert!(by("secret").unwrap().hidden);
        assert!(
            by("derived").is_none(),
            "computed values are not parameters"
        );
        assert!(
            by("x").is_none(),
            "locals inside modules are not parameters"
        );
    }
}

#[cfg(test)]
mod file_tests {
    use super::*;

    /// Guards the parse against the real model shipped with the viewer.
    #[test]
    fn parses_the_bundled_model() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../model/clamshell.scad");
        let Ok(src) = std::fs::read_to_string(path) else {
            eprintln!("skipping: {path} not present");
            return;
        };
        let schema = parse(&src);
        let by = |n: &str| schema.params.iter().find(|p| p.name == n);

        // BOSL2 calls were replaced natively so renders skip parsing the library.
        assert!(
            schema.includes.is_empty(),
            "includes: {:?}",
            schema.includes
        );
        let parts = crate::pipeline::part_plan(&schema).expect("model declares parts");
        let names: Vec<_> = parts.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["base", "lid", "dividers", "inserts", "gridfinity"]);
        assert!(parts[4].ignores.contains("cells"));
        assert!(!parts[4].ignores.contains("footy"));
        assert!(parts[0].ignores.contains("gridfinity_x"));
        assert_eq!(by("fills").unwrap().default, json!([]));
        assert_eq!(by("tools").unwrap().kind, ParamKind::Vector);
        assert!(parts[0].ignores.contains("cells"));
        assert!(parts[2].ignores.contains("footy"));
        assert_eq!(by("config").unwrap().options.len(), 5);
        assert_eq!(by("footy").unwrap().kind, ParamKind::Bool);
        assert_eq!(by("col_splits").unwrap().kind, ParamKind::Vector);
        assert_eq!(by("cells").unwrap().default.as_array().unwrap().len(), 9);
        assert!(
            by("div_t").unwrap().hidden,
            "internal knobs are advanced-only"
        );
        // Derived values must not become knobs: they are recomputed by OpenSCAD.
        assert!(by("base_h").is_none());
        assert!(by("dims").is_none());
        assert!(by("_cells").is_none());

        // Easy-open options: basic toggles, tuning under Advanced, and the
        // multi-line hint list must not leak knobs.
        assert!(!by("pry_notch").unwrap().hidden);
        assert!(by("lift_tab").is_none());
        assert!(!by("finger_scoops").unwrap().hidden);
        assert!(!by("scoop_radius").unwrap().hidden);
        for derived in ["_hints", "why", "_pry", "_notch_ok", "_scoops", "_fill_ids"] {
            assert!(by(derived).is_none(), "{derived} became a knob");
        }
    }
}
