// Dev only: serve standalone projects (projects/<slug>/vite.config.ts) at
// /p/<slug>/ from the shell's dev server, like the Rust server does in prod.
// Each project gets its own Vite server on a spare port; HTTP requests are
// forwarded to it, and its HMR client connects to that port directly.
import { existsSync, readdirSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin, type ViteDevServer } from "vite";

const projectsDir = fileURLToPath(new URL("../projects", import.meta.url));

function standaloneProjects() {
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(projectsDir, d.name, "vite.config.ts")))
    .map((d) => ({ slug: d.name, dir: join(projectsDir, d.name) }));
}

export function standaloneDev(): Plugin {
  return {
    name: "site:standalone-dev",
    apply: "serve",
    async configureServer(server) {
      const children: ViteDevServer[] = [];
      const ports = new Map<string, number>();

      for (const { slug, dir } of standaloneProjects()) {
        const child = await createServer({
          root: dir,
          configFile: join(dir, "vite.config.ts"),
          clearScreen: false,
          logLevel: "warn",
          server: { port: 5200, strictPort: false },
        });
        await child.listen();
        children.push(child);
        const address = child.httpServer?.address();
        if (address && typeof address === "object") ports.set(slug, address.port);
      }
      server.httpServer?.once("close", () => {
        for (const child of children) child.close();
      });
      if (ports.size > 0) {
        server.config.logger.info(
          `  standalone: ${[...ports.keys()].map((s) => `/p/${s}/`).join(", ")}`,
        );
      }

      server.middlewares.use((req, res, next) => {
        const slug = req.url?.match(/^\/p\/([^/?#]+)/)?.[1];
        const port = slug && ports.get(slug);
        if (!slug || !port || !req.url) return next();

        // The child's base is /p/<slug>/, so add the trailing slash first.
        if (req.url === `/p/${slug}` || req.url.startsWith(`/p/${slug}?`)) {
          res.writeHead(302, { location: req.url.replace(`/p/${slug}`, `/p/${slug}/`) });
          return res.end();
        }

        const upstream = request(
          { host: "localhost", port, path: req.url, method: req.method, headers: req.headers },
          (up) => {
            res.writeHead(up.statusCode ?? 502, up.headers);
            up.pipe(res);
          },
        );
        upstream.on("error", (err) => {
          res.statusCode = 502;
          res.end(`standalone dev server for ${slug} failed: ${err.message}`);
        });
        req.pipe(upstream);
      });
    },
  };
}
