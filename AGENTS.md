# Agent instructions

## Git

- **Never commit.** Do not run `git commit`, `git push`, `git merge`, `git rebase`,
  `git tag`, or anything else that creates or rewrites history. Don't stage files
  with `git add` either; the user stages and commits.
- **Always suggest a commit message** at the end of any change, in
  [Conventional Commits](https://www.conventionalcommits.org/) format.
  **Subject line only. Never write a body or footer.**

  ```
  <type>(<scope>): <imperative summary, lowercase, no period, ≤72 chars>
  ```

  - Types: `feat`, `fix`, `refactor`, `perf`, `style`, `docs`, `test`, `build`,
    `ci`, `chore`.
  - Scopes match the area touched: `server`, `web`, `site-kit`, `scripts`,
    `templates`, `deps`, `tooling`, or a project slug (e.g. `hello-wasm`). Omit
    the scope if the change spans many areas.
  - Breaking changes: add `!` after the type/scope (no footer).
  - If unrelated changes were made, suggest one message per logical commit and
    say which files go in each.

## Tooling

- mise manages tool versions and runs tasks (`mise.toml`). Use `mise run <task>`
  rather than ad-hoc commands, and add new workflows as mise tasks.
- npm workspaces handle JS packages. Don't use or reintroduce pnpm, yarn, or bun.
  Reference workspace packages with `"*"`, not `workspace:*`.

## Project

See `README.md` for layout and workflows. Key rules:

- One folder = one unit. Projects live in `projects/<slug>/` and are
  auto-discovered. Don't hand-register them anywhere.
- Server features are modules in `server/src/routes/` merged in `routes/mod.rs`.
- Before finishing, run `mise run check`, plus `mise run build` if Rust or build
  config changed.
