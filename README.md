# personal-website

My portfolio, and a home for side projects. One Rust (Axum) binary serves a
Vite + React site shell plus any number of self-contained projects.

```
server/            Axum server: static files, SPA fallbacks, headers
web/               Site shell (React Router + Tailwind): home, about, projects
packages/site-kit  Shared project contract (defineProject) and theme tokens
projects/<slug>/   One folder per project, discovered automatically
templates/         Scaffolds used by `mise run new`
scripts/           Build and scaffold scripts
```

## Develop

[mise](https://mise.jdx.dev) pins every tool (Node, Rust with the WASM target,
wasm-pack) in `mise.toml` and runs all tasks. npm handles JS packages.

```sh
mise install                   # toolchain
mise run install               # npm workspace dependencies
mise run dev                   # whole site with HMR on http://localhost:5173 (standalone apps at /p/<slug>/)
mise run dev:project <slug>    # one standalone project by itself
mise tasks                     # list everything
```

Rebuild a project's Rust crate with `mise run build:wasm` (add `--dev` for a
fast debug build). Vite picks up the new `pkg/` automatically.

## Build and run in production

```sh
mise run build    # WASM crates -> web shell -> standalone apps into dist/, plus release server
mise run serve    # or: ./target/release/server
```

Server env vars: `SITE_DIR` (default `dist`), `PORT` (default `3000`),
`ISOLATION=0` to turn off the cross-origin isolation headers.

Docker: `docker build -t site . && docker run -p 3000:3000 site`.

## Projects

Every portfolio entry is a folder in `projects/` with a `project.ts` manifest.
There are three kinds:

| mode         | lives at            | what it is                                                     |
| ------------ | ------------------- | -------------------------------------------------------------- |
| `embedded`   | `/projects/<slug>`  | A React component lazy-loaded inside the site shell             |
| `standalone` | `/p/<slug>/`        | A complete Vite app with its own `vite.config.ts` and build    |
| `external`   | its `url`           | Just a card linking to work hosted elsewhere                   |

**Add one:**

```sh
mise run new my-thing                          # embedded
mise run new my-thing --standalone             # standalone app
mise run new scad-viewer --standalone --wasm   # either kind, plus a Rust crate in wasm/
```

For an external entry, make a folder with only a `project.ts` (and a
`package.json` depending on `@site/kit`) using `mode: "external", url: "..."`.

**Remove one:** delete its folder, then `npm install`. It disappears from the
listing, the build and the Cargo workspace.

Manifest options: `order` (lower sorts first), `draft: true` (hidden from
lists but reachable by URL), `tags`, `year` and `links`.

Pages are served cross-origin isolated (COOP `same-origin`, COEP
`credentialless`), so `SharedArrayBuffer` and threaded WASM, such as
openscad-wasm, work in both dev and prod. Cross-origin resources still load,
but without credentials.

## Blog

Posts are MDX files in `web/content/blog/<slug>.mdx`, each lazy-loaded as its
own chunk. Add the post's metadata to `web/src/data/posts.ts` too; the slug
must match the filename. Put images under `web/public/blog/<slug>/`.

## UI

Tailwind v4 with shadcn/ui (new-york, zinc). Design tokens live in
`packages/site-kit/src/theme.css` so projects can share them. To add
components, run `npx shadcn@latest add <component>` from `web/`.

## Server features

Each feature is a module in `server/src/routes/` exposing a `router()`. To
enable it, add one line in `routes/mod.rs`, behind a Cargo feature if it
brings in dependencies. Delete the module and its line to remove it. See the
doc comment in `routes/mod.rs`.
