import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { fixturePlugin } from "./fixtures";

const root = fileURLToPath(new URL("../../", import.meta.url));
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  root: local("."),
  envDir: false,
  publicDir: false,
  cacheDir: `${root}node_modules/.vite-story-preview`,
  esbuild: { jsx: "automatic" },
  css: { postcss: root },
  resolve: { alias: {
    "@": root,
    "next/link": local("link.tsx"),
    "next/image": local("image.tsx"),
    "@clerk/nextjs": local("clerk.ts"),
  } },
  plugins: [fixturePlugin(), {
    name: "fixed-preview-font",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/preview-font.otf") return next();
        res.setHeader("Content-Type", "font/otf");
        res.end(readFileSync(`${root}lib/fonts/NotoSansKR-Regular.otf`));
      });
    },
  }],
  server: {
    host: "127.0.0.1", port: 4174, strictPort: true,
    fs: { allow: [root], deny: ["**/.env*", "**/*.pem", "**/*.key", "**/.git/**"] },
    headers: { "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:4174; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'none'" },
  },
});
