//! Image dithering: reduce an RGBA image to a fixed palette using
//! error diffusion or ordered (Bayer) dithering.

use wasm_bindgen::prelude::*;

/// (dx, dy, weight) taps for an error-diffusion kernel, plus its divisor.
struct Kernel {
    taps: &'static [(i32, i32, f32)],
    divisor: f32,
}

const FLOYD_STEINBERG: Kernel = Kernel {
    taps: &[(1, 0, 7.0), (-1, 1, 3.0), (0, 1, 5.0), (1, 1, 1.0)],
    divisor: 16.0,
};

// Only spreads 6/8 of the error, which keeps highlights and shadows crisp.
const ATKINSON: Kernel = Kernel {
    taps: &[
        (1, 0, 1.0),
        (2, 0, 1.0),
        (-1, 1, 1.0),
        (0, 1, 1.0),
        (1, 1, 1.0),
        (0, 2, 1.0),
    ],
    divisor: 8.0,
};

const JARVIS: Kernel = Kernel {
    taps: &[
        (1, 0, 7.0),
        (2, 0, 5.0),
        (-2, 1, 3.0),
        (-1, 1, 5.0),
        (0, 1, 7.0),
        (1, 1, 5.0),
        (2, 1, 3.0),
        (-2, 2, 1.0),
        (-1, 2, 3.0),
        (0, 2, 5.0),
        (1, 2, 3.0),
        (2, 2, 1.0),
    ],
    divisor: 48.0,
};

const SIERRA_LITE: Kernel = Kernel {
    taps: &[(1, 0, 2.0), (-1, 1, 1.0), (0, 1, 1.0)],
    divisor: 4.0,
};

enum Method {
    Diffuse(&'static Kernel),
    Ordered(usize),
    Threshold,
}

fn parse_method(name: &str) -> Option<Method> {
    Some(match name {
        "floyd-steinberg" => Method::Diffuse(&FLOYD_STEINBERG),
        "atkinson" => Method::Diffuse(&ATKINSON),
        "jarvis" => Method::Diffuse(&JARVIS),
        "sierra-lite" => Method::Diffuse(&SIERRA_LITE),
        "bayer-2" => Method::Ordered(2),
        "bayer-4" => Method::Ordered(4),
        "bayer-8" => Method::Ordered(8),
        "threshold" => Method::Threshold,
        _ => return None,
    })
}

/// Dithers `rgba` (width * height * 4 bytes) to `palette` (flat RGB triples).
///
/// `strength` scales the diffused error or the ordered-dither spread; 1.0 is
/// the classic look, 0.0 is plain nearest-color. Alpha is passed through.
#[wasm_bindgen]
pub fn dither(
    rgba: &[u8],
    width: u32,
    height: u32,
    method: &str,
    palette: &[u8],
    strength: f32,
) -> Result<Vec<u8>, JsError> {
    dither_rgba(rgba, width, height, method, palette, strength).map_err(JsError::new)
}

/// Platform-independent core of [`dither`].
pub fn dither_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    method: &str,
    palette: &[u8],
    strength: f32,
) -> Result<Vec<u8>, &'static str> {
    let (w, h) = (width as usize, height as usize);
    if rgba.len() != w * h * 4 {
        return Err("rgba length does not match width * height * 4");
    }
    if palette.is_empty() || !palette.len().is_multiple_of(3) {
        return Err("palette must be non-empty RGB triples");
    }
    let method = parse_method(method).ok_or("unknown dithering method")?;
    let palette: Vec<[f32; 3]> = palette
        .as_chunks::<3>()
        .0
        .iter()
        .map(|c| [c[0] as f32, c[1] as f32, c[2] as f32])
        .collect();

    let mut out = rgba.to_vec();
    match method {
        Method::Diffuse(kernel) => diffuse(&mut out, w, h, &palette, kernel, strength),
        Method::Ordered(n) => ordered(&mut out, w, h, &palette, n, strength),
        Method::Threshold => ordered(&mut out, w, h, &palette, 1, 0.0),
    }
    Ok(out)
}

/// Nearest palette entry, using weighted RGB distance (closer to perceived difference).
fn nearest(palette: &[[f32; 3]], c: [f32; 3]) -> [f32; 3] {
    let mut best = palette[0];
    let mut best_d = f32::MAX;
    for &p in palette {
        let (dr, dg, db) = (c[0] - p[0], c[1] - p[1], c[2] - p[2]);
        let d = 2.0 * dr * dr + 4.0 * dg * dg + 3.0 * db * db;
        if d < best_d {
            best_d = d;
            best = p;
        }
    }
    best
}

fn diffuse(px: &mut [u8], w: usize, h: usize, palette: &[[f32; 3]], k: &Kernel, strength: f32) {
    let mut buf: Vec<[f32; 3]> = px
        .as_chunks::<4>()
        .0
        .iter()
        .map(|p| [p[0] as f32, p[1] as f32, p[2] as f32])
        .collect();

    for y in 0..h {
        // Serpentine scan: alternate direction each row to avoid directional streaks.
        let ltr = y % 2 == 0;
        for i in 0..w {
            let x = if ltr { i } else { w - 1 - i };
            let idx = y * w + x;
            let old = buf[idx];
            let new = nearest(palette, old);
            buf[idx] = new;
            let err = [
                (old[0] - new[0]) * strength / k.divisor,
                (old[1] - new[1]) * strength / k.divisor,
                (old[2] - new[2]) * strength / k.divisor,
            ];
            for &(dx, dy, wt) in k.taps {
                let nx = x as i32 + if ltr { dx } else { -dx };
                let ny = y as i32 + dy;
                if nx < 0 || nx >= w as i32 || ny >= h as i32 {
                    continue;
                }
                let n = &mut buf[ny as usize * w + nx as usize];
                n[0] += err[0] * wt;
                n[1] += err[1] * wt;
                n[2] += err[2] * wt;
            }
        }
    }

    for (p, c) in px.as_chunks_mut::<4>().0.iter_mut().zip(buf) {
        p[0] = c[0] as u8;
        p[1] = c[1] as u8;
        p[2] = c[2] as u8;
    }
}

/// Bayer index matrix of size n (a power of two), built recursively.
fn bayer(n: usize) -> Vec<f32> {
    let mut m = vec![0.0f32];
    let mut size = 1;
    while size < n {
        let next = size * 2;
        let mut out = vec![0.0f32; next * next];
        for y in 0..size {
            for x in 0..size {
                let v = 4.0 * m[y * size + x];
                out[y * next + x] = v;
                out[y * next + x + size] = v + 2.0;
                out[(y + size) * next + x] = v + 3.0;
                out[(y + size) * next + x + size] = v + 1.0;
            }
        }
        m = out;
        size = next;
    }
    m
}

fn ordered(px: &mut [u8], w: usize, _h: usize, palette: &[[f32; 3]], n: usize, strength: f32) {
    let matrix = bayer(n);
    let cells = (n * n) as f32;
    // Spread the threshold over roughly one palette step.
    let spread = 255.0 / (palette.len() as f32).sqrt().max(1.0) * strength;

    for (i, p) in px.as_chunks_mut::<4>().0.iter_mut().enumerate() {
        let (x, y) = (i % w, i / w);
        let t = ((matrix[(y % n) * n + (x % n)] + 0.5) / cells - 0.5) * spread;
        let c = nearest(palette, [p[0] as f32 + t, p[1] as f32 + t, p[2] as f32 + t]);
        p[0] = c[0] as u8;
        p[1] = c[1] as u8;
        p[2] = c[2] as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BW: [u8; 6] = [0, 0, 0, 255, 255, 255];

    fn gray(w: usize, h: usize, v: u8) -> Vec<u8> {
        (0..w * h).flat_map(|_| [v, v, v, 255]).collect()
    }

    fn white_fraction(px: &[u8]) -> f32 {
        let n = px.len() / 4;
        px.as_chunks::<4>().0.iter().filter(|p| p[0] == 255).count() as f32 / n as f32
    }

    #[test]
    fn output_uses_only_palette_colors_and_keeps_alpha() {
        let img: Vec<u8> = (0..64u32)
            .flat_map(|i| [(i * 4) as u8, 90, 200, 77])
            .collect();
        let out = dither_rgba(&img, 8, 8, "atkinson", &BW, 1.0).unwrap();
        for p in out.as_chunks::<4>().0 {
            assert!(p[..3] == [0, 0, 0] || p[..3] == [255, 255, 255]);
            assert_eq!(p[3], 77);
        }
    }

    #[test]
    fn mid_gray_dithers_to_about_half_white() {
        for method in [
            "floyd-steinberg",
            "jarvis",
            "sierra-lite",
            "bayer-4",
            "bayer-8",
        ] {
            let out = dither_rgba(&gray(64, 64, 128), 64, 64, method, &BW, 1.0).unwrap();
            let f = white_fraction(&out);
            assert!((0.4..0.6).contains(&f), "{method}: {f}");
        }
    }

    #[test]
    fn threshold_is_plain_nearest_color() {
        let out = dither_rgba(&gray(4, 4, 100), 4, 4, "threshold", &BW, 1.0).unwrap();
        assert_eq!(white_fraction(&out), 0.0);
    }

    #[test]
    fn bayer_matrix_is_a_permutation() {
        let mut m: Vec<u32> = bayer(8).iter().map(|&v| v as u32).collect();
        m.sort();
        assert_eq!(m, (0..64).collect::<Vec<_>>());
    }

    #[test]
    fn rejects_bad_input() {
        assert!(dither_rgba(&[0; 4], 2, 2, "atkinson", &BW, 1.0).is_err());
        assert!(dither_rgba(&gray(1, 1, 0), 1, 1, "nope", &BW, 1.0).is_err());
        assert!(dither_rgba(&gray(1, 1, 0), 1, 1, "atkinson", &[1, 2], 1.0).is_err());
    }
}
