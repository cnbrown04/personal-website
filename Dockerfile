# --- build: tool versions come from mise.toml ---
FROM debian:bookworm AS build
ARG MISE_VERSION=v2026.10.1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl build-essential \
 && rm -rf /var/lib/apt/lists/*
ENV MISE_INSTALL_PATH=/usr/local/bin/mise \
    MISE_DATA_DIR=/mise \
    CARGO_HOME=/mise/cargo \
    RUSTUP_HOME=/mise/rustup \
    PATH=/mise/shims:/mise/cargo/bin:$PATH
RUN curl -fsSL https://mise.run | MISE_VERSION=${MISE_VERSION} sh
WORKDIR /app
COPY mise.toml .
RUN mise trust && mise install
COPY . .
RUN mise trust && npm ci && mise run build

# --- runtime: just the binary and the built site ---
FROM debian:bookworm-slim
RUN useradd --system site
WORKDIR /app
COPY --from=build /app/target/release/server /app/server
COPY --from=build /app/dist /app/dist
USER site
ENV SITE_DIR=/app/dist PORT=3000
EXPOSE 3000
CMD ["/app/server"]
