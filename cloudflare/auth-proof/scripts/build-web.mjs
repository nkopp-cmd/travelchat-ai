import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist/public/", root);
await mkdir(new URL("assets/", output), { recursive: true });
await build({
  absWorkingDir: fileURLToPath(root), entryPoints: ["web/app.tsx"],
  outfile: "dist/public/assets/app.js", bundle: true, minify: true,
  platform: "browser", format: "esm", target: ["es2022"],
  jsx: "automatic", tsconfig: "tsconfig.web.json",
  external: ["/assets/NotoSansKR-Regular.otf"],
  define: { "process.env.NODE_ENV": '"production"' }, legalComments: "linked",
});
await writeFile(new URL("index.html", output), await readFile(new URL("web/index.html", root)));
for (const [name, hash] of [
  ["NotoSansKR-Regular.otf", "69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68"],
  ["OFL.txt", "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2"],
]) {
  const bytes = await readFile(new URL(`../../lib/fonts/${name}`, root));
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`Unapproved font source: ${name}`);
  await writeFile(new URL(`assets/${name}`, output), bytes);
}
