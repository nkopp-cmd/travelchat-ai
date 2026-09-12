import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Use the package's compiler, not host TypeScript loader flags stripped by isolation.
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("../../../lib/itineraries/plan-contract.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "neutral",
});
export const { isBoundedJSON, isEditableItineraryPlan } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64")
);
