import * as fs from "node:fs";
import * as path from "node:path";
import { geographySeedManifest } from "../lib/geography/seed-manifest";
import { buildTypedSnapshotSource } from "../lib/geography/seed-tools";

const outputPath = path.resolve(process.cwd(), "lib/geography/cities.generated.ts");
const expected = buildTypedSnapshotSource(geographySeedManifest);
const checkOnly = process.argv.includes("--check");
const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";

if (checkOnly) {
  if (current !== expected) {
    console.error("Generated geography snapshot is missing or stale.");
    process.exitCode = 1;
  } else {
    console.log("Generated geography snapshot is current.");
  }
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}.`);
}
