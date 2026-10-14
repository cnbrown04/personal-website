//! Each module exposes `router()` and is merged here. To add a server
//! feature, create `routes/<name>.rs` and add one `.merge(...)` line, gated
//! behind a Cargo feature if it pulls in dependencies:
//!
//! ```ignore
//! #[cfg(feature = "contact")]
//! mod contact;
//! // ...
//! #[cfg(feature = "contact")]
//! let app = app.nest("/api/contact", contact::router());
//! ```

mod health;
mod site;

use axum::Router;

use crate::config::Config;

pub fn router(config: &Config) -> Router {
    let app = Router::new().merge(health::router());

    // Static site goes last: it is the fallback for every unmatched path.
    site::attach(app, config)
}
