// Loads the D1 facade (lib/app-data/d1-postgrest.ts) into plain Node scripts: esbuild bundle with the app's tsconfig
// paths; "server-only" (provided by Next.js at build time) becomes an empty module.
import { build } from "esbuild";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function loadFacade() {
  const out = await build({
    stdin: { contents: `export { d1Client, TABLES } from "@/lib/app-data/d1-postgrest";
      export { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";`, resolveDir: root, sourcefile: "facade.ts", loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node", external: ["node:*"], tsconfig: join(root, "tsconfig.json"), logLevel: "silent",
    plugins: [{ name: "server-only", setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
      b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}
