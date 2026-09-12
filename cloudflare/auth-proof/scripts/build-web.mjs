import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir, lstat, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = new URL("../", import.meta.url);
const product = new URL("../../", root);
const productRequire = createRequire(new URL("package.json", product));
const output = new URL("dist/public/", root);
await mkdir(new URL("assets/", output), { recursive: true });
const result = await build({
  absWorkingDir: fileURLToPath(root), entryPoints: ["web/app.tsx"],
  outfile: "dist/public/assets/app.js", bundle: true, minify: true,
  platform: "browser", format: "esm", target: ["es2022"],
  jsx: "automatic", tsconfig: "tsconfig.web.json",
  external: ["/assets/NotoSansKR-Regular.otf"],
  loader: { ".png": "file" }, assetNames: "[name]-[hash]",
  alias: { ...Object.fromEntries(["react", "react-dom", "lucide-react"].map((name) => [name, fileURLToPath(new URL(`node_modules/${name}`, root))])),
    "better-auth/react": createRequire(import.meta.url).resolve("better-auth/react") },
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '""' }, legalComments: "linked",
  metafile: true,
});
const inputs = Object.keys(result.metafile.inputs);
for (const name of ["native-itinerary-collection", "native-itinerary-editor"]) {
  if (!inputs.some((input) => input.endsWith(`/components/itineraries/${name}.tsx`))) throw new Error(`Missing shared component: ${name}`);
}
const forbidden = inputs.find((input) => /node_modules\/(?:@clerk|next|server-only|@supabase)\//.test(input)
  || /(?:^|\/)providers\/(?:index|clerk-session-provider)\.tsx$/.test(input)
  || /^(?:src|test|scripts|app)\//.test(input.replace(/^(?:\.\.\/)+/, "")));
if (forbidden) throw new Error(`Forbidden preview client dependency: ${forbidden}`);
const reactCopies = inputs.filter((input) => /node_modules\/react\/index\.js$/.test(input));
if (reactCopies.length !== 1) throw new Error("Preview must use one React instance");
await writeFile(new URL("web-dependencies.json", new URL("dist/", root)), JSON.stringify(inputs.sort(), null, 2));

// Reuse the root tokens and Tailwind utilities, scoped away from the existing catalog/auth UI.
// Radix renders its menus and confirmation dialog in body portals.
const postcss = productRequire("postcss");
const tailwind = productRequire("tailwindcss");
const loadConfig = productRequire("tailwindcss/loadConfig");
const config = loadConfig(fileURLToPath(new URL("tailwind.config.ts", product)));
config.content = inputs.filter((input) => /\.tsx$/.test(input)).map((input) => fileURLToPath(new URL(input, root)));
const globals = postcss.parse(await readFile(new URL("app/globals.css", product), "utf8"));
let tokens;
globals.walkRules(":root", (rule) => { tokens ??= rule.toString(); });
if (!tokens) throw new Error("Missing root design tokens");
const css = await postcss([tailwind(config)]).process(`@tailwind base;\n${tokens}\n@tailwind utilities;`, { from: undefined });
const scope = ':is(.native-trips, body > [data-radix-popper-content-wrapper], body > [data-slot="alert-dialog-overlay"], body > [data-slot="alert-dialog-content"])';
css.root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.flatMap((selector) => [":root", "html", ":host", "body"].includes(selector)
    ? [scope] : [`${scope} ${selector}`, `${scope}:is(${selector})`]);
});
const nativeCSS = css.root.toString() + `\n${scope} { --destructive: 0 74% 42%; --destructive-foreground: 0 0% 100%; }
${scope} :focus-visible { outline: 3px solid hsl(var(--ring)); outline-offset: 3px; }
${scope}[data-slot="alert-dialog-content"] { max-width: min(32rem, calc(100% - 2rem)); }`;
await writeFile(new URL("assets/app.css", output), (await readFile(new URL("assets/app.css", output), "utf8")) + "\n" + nativeCSS);
await writeFile(new URL("index.html", output), await readFile(new URL("web/index.html", root)));
const leafletPackage = pathToFileURL(createRequire(import.meta.url).resolve("leaflet/package.json"));
await writeFile(new URL("assets/leaflet-LICENSE.txt", output), await readFile(new URL("LICENSE", leafletPackage)));
for (const [name, hash] of [
  ["NotoSansKR-Regular.otf", "69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68"],
  ["OFL.txt", "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2"],
]) {
  const bytes = await readFile(new URL(`../../lib/fonts/${name}`, root));
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`Unapproved font source: ${name}`);
  await writeFile(new URL(`assets/${name}`, output), bytes);
}

// Only reviewed UUID JPEGs enter public output. Never recursively copy pilot exports.
const pilot = new URL("pilot/images/", root);
const publicPilot = new URL("pilot/", output);
await rm(publicPilot, { recursive: true, force: true });
let entries = [];
try {
  for (const folder of [new URL("pilot/", root), pilot]) {
    const info = await lstat(folder);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Pilot source must be a trusted local directory");
  }
  entries = await readdir(pilot, { withFileTypes: true });
} catch (error) { if (error.code !== "ENOENT") throw error; }
let manifest;
try {
  const path = new URL("pilot/manifest.json", root);
  if (!(await lstat(path)).isFile()) throw new Error("Pilot manifest must be a regular file");
  manifest = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.some((entry) => !entry || typeof entry.file !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i.test(entry.file) || !/^[0-9a-f]{64}$/i.test(entry.sha256))) throw new Error("Invalid pilot checksum manifest");
  if (new Set(manifest.files.map((entry) => entry.file)).size !== manifest.files.length) throw new Error("Duplicate pilot manifest filename");
} catch (error) { if (error.code !== "ENOENT") throw error; }
const copied = new Set();
for (const entry of entries) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i.test(entry.name)) continue;
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Invalid pilot asset: ${entry.name}`);
  const bytes = await readFile(new URL(entry.name, pilot));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error(`Pilot asset is not JPEG: ${entry.name}`);
  const expected = manifest?.files.find((file) => file.file === entry.name)?.sha256;
  if (manifest && (!expected || createHash("sha256").update(bytes).digest("hex") !== expected.toLowerCase())) throw new Error(`Unapproved pilot asset: ${entry.name}`);
  await mkdir(publicPilot, { recursive: true });
  await writeFile(new URL(entry.name, publicPilot), bytes);
  copied.add(entry.name);
}
if (manifest?.files.some((entry) => !copied.has(entry.file))) throw new Error("Pilot manifest references a missing asset");
if (!copied.size) console.warn("Pilot photos are not ready. Building without pilot images.");
if (copied.size) {
  const credits = new URL("pilot/licenses.md", root);
  if (!(await lstat(credits)).isFile()) throw new Error("Pilot credits must be a regular local file");
  await writeFile(new URL("licenses.txt", publicPilot), await readFile(credits));
}
