//! Serves the built frontend in `dist/`:
//! - real files as-is (hashed `assets/` cached forever)
//! - `/p/<slug>/...` falls back to that standalone app's `index.html`
//! - other extensionless paths fall back to the shell's `index.html`

use std::path::{Path, PathBuf};

use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{HeaderValue, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
};
use tower_http::services::ServeDir;

use crate::config::Config;

#[derive(Clone)]
struct SiteState {
    dir: PathBuf,
}

pub fn attach(app: Router, config: &Config) -> Router {
    let state = SiteState {
        dir: config.site_dir.clone(),
    };
    // Directories never resolve here: public/ asset folders like dist/blog/
    // share names with app routes, so they must fall through to the app.
    let files = ServeDir::new(&config.site_dir)
        .append_index_html_on_directories(false)
        .fallback(axum::routing::get(spa_fallback).with_state(state));

    let app = app
        .fallback_service(files)
        .layer(middleware::from_fn(cache_headers));

    if config.isolation {
        app.layer(middleware::from_fn(isolation_headers))
    } else {
        app
    }
}

async fn spa_fallback(State(state): State<SiteState>, uri: Uri) -> Response {
    let path = uri.path();

    // A missing file (e.g. /assets/old-hash.js) is a real 404, not the app.
    let last = path.rsplit('/').next().unwrap_or_default();
    if last.contains('.') {
        return StatusCode::NOT_FOUND.into_response();
    }

    let index = standalone_index(&state.dir, path).unwrap_or_else(|| state.dir.join("index.html"));
    match tokio::fs::read_to_string(&index).await {
        Ok(html) => Html(html).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "site not built").into_response(),
    }
}

/// `/p/<slug>/anything` -> `dist/p/<slug>/index.html`, if that app exists.
fn standalone_index(dir: &Path, path: &str) -> Option<PathBuf> {
    let slug = path.strip_prefix("/p/")?.split('/').next()?;
    if slug.is_empty() || slug.starts_with('.') {
        return None;
    }
    let index = dir.join("p").join(slug).join("index.html");
    index.is_file().then_some(index)
}

async fn cache_headers(req: Request, next: Next) -> Response {
    let immutable = req.uri().path().contains("/assets/");
    let mut res = next.run(req).await;
    let value = if immutable && res.status().is_success() {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    res.headers_mut()
        .entry(header::CACHE_CONTROL)
        .or_insert(HeaderValue::from_static(value));
    res
}

async fn isolation_headers(req: Request<Body>, next: Next) -> Response {
    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    headers.insert(
        "cross-origin-opener-policy",
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        "cross-origin-embedder-policy",
        HeaderValue::from_static("credentialless"),
    );
    res
}
