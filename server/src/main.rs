mod config;
mod routes;

use std::net::SocketAddr;

use config::Config;
use tower_http::{CompressionLevel, compression::CompressionLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();

    let config = Config::from_env();
    if !config.site_dir.join("index.html").exists() {
        tracing::warn!(dir = %config.site_dir.display(), "no index.html found; run `mise run build:site`");
    }

    let app = routes::router(&config)
        // Built assets arrive precompressed; this only covers the rest, so keep it cheap.
        .layer(CompressionLayer::new().quality(CompressionLevel::Fastest))
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind");
    tracing::info!("listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.ok();
        })
        .await
        .expect("server error");
}
