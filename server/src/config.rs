use std::{env, path::PathBuf};

/// Runtime configuration, read from environment variables.
#[derive(Clone, Debug)]
pub struct Config {
    /// Built frontend (`dist/`). Env: `SITE_DIR`.
    pub site_dir: PathBuf,
    /// Env: `PORT`. Default 3000.
    pub port: u16,
    /// Send COOP/COEP so pages are cross-origin isolated (SharedArrayBuffer,
    /// WASM threads). Env: `ISOLATION=0` to disable.
    pub isolation: bool,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            site_dir: env::var("SITE_DIR").map_or_else(|_| PathBuf::from("dist"), PathBuf::from),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            isolation: env::var("ISOLATION").map_or(true, |v| v != "0" && v != "false"),
        }
    }
}
