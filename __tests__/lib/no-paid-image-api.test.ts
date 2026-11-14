// @vitest-environment node
// Nils 2026-11-14 (APPROVALS.md): no paid image API anywhere, not even as a fallback. Images come only from the
// pre-generated painted library (made on the ChatGPT subscription via shared/scripts/codex-image.py).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "lib", "components", "hooks", "providers", "scripts", "middleware.ts"];
const SKIP = /node_modules|\.next|\.open-next|image-library\.json$/;

function files(path: string): string[] {
  if (!existsSync(path) || SKIP.test(path)) return [];
  if (statSync(path).isFile()) return /\.(m?[jt]sx?)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

const BANNED: Array<[string, RegExp]> = [
  ["deleted paid image modules", /from\s+["']@\/lib\/(imagen|flux|seedream|image-provider)["']/],
  // FAL stays for social VIDEO understanding (lib/social-spot-submissions.ts); its image models are banned.
  ["FAL image models", /fal-ai\/(flux|recraft|ideogram|stable-diffusion|sdxl|imagen|seedream|hidream)/i],
  ["Seedream / ARK image API", /\bARK_API_KEY\b|seedream|ark\.[a-z-]+\.bytepluses\.com|volces\.com/i],
  ["OpenAI image API", /gpt-image|dall-e|\/v1\/images\/(generations|edits)|images\.generate\(/i],
  ["Gemini / Imagen image output", /responseModalities[^\n]*IMAGE|gemini-[\w.-]*image|nano-banana|imagen-\d|generateImages\(|generateImage\(/i],
];

describe("no paid image API (Nils 2026-11-14)", () => {
  const sources = ROOTS.flatMap(files);

  it("scans the app source", () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  for (const [name, pattern] of BANNED) {
    it(`no source file uses: ${name}`, () => {
      const hits = sources.filter((file) => pattern.test(readFileSync(file, "utf8")));
      expect(hits).toEqual([]);
    });
  }

  it("the deleted provider modules stay deleted", () => {
    for (const file of ["lib/imagen.ts", "lib/flux.ts", "lib/seedream.ts", "lib/image-provider.ts"]) expect(existsSync(file)).toBe(false);
  });

  it("the image model list offers only the free painted library", async () => {
    const { MODEL_CREDITS, TIER_MODELS } = await import("@/lib/model-credits");
    expect(Object.keys(MODEL_CREDITS)).toEqual(["library"]);
    expect(MODEL_CREDITS.library.credits).toBe(0);
    expect(new Set(Object.values(TIER_MODELS).flat())).toEqual(new Set(["library"]));
  });
});
