import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";
import { checkoutSignUpUrl } from "@/lib/pricing-checkout";

// Push BI1: the Gravity release lane smoke-checks the money path (pricing -> planner -> sign-up from
// the preview Save button) and rolls back when a page loses its marker. A marker renamed in the source
// would make every release roll back, so each marker must still exist in the component that renders it.
const root = join(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const release = JSON.parse(read(".gravity/release.json")) as { smoke: { url: string; status?: number; contains?: string }[] };

describe("Gravity release smoke (Push BI1)", () => {
  const byPath = new Map(release.smoke.map((check) => [new URL(check.url).pathname + new URL(check.url).search, check]));

  it("stays within the lane limit of 5 checks and keeps the version check", () => {
    expect(release.smoke.length).toBeLessThanOrEqual(5);
    expect(byPath.get("/api/version")?.contains).toBe("{sha}");
  });

  // Push BU2: the marker is the signed-out Pro subscribe link, so a release that kills the paid button rolls back.
  it("checks the pricing page by the signed-out Pro subscribe link the page renders", () => {
    const marker = byPath.get("/pricing")?.contains;
    expect(marker).toBe(`href="${checkoutSignUpUrl("pro", "monthly")}"`);
    const page = read("app/pricing/page.tsx");
    expect(page).toContain('href={checkoutSignUpUrl(tier, isYearly ? "yearly" : "monthly")}');
    expect(page).toContain("useState(false)"); // isYearly starts monthly in the edge HTML
  });

  it("checks the planner by the first wizard step label", () => {
    expect(byPath.get("/itineraries/new")?.contains).toBe("Step 1: Destination");
    const progress = read("components/itineraries/wizard/wizard-progress.tsx");
    expect(progress).toMatch(/\{ label: "Destination" \}/);
    expect(progress).toContain("aria-label={`Step ${index + 1}: ${step.label}`}");
  });

  it("checks the sign-up page the preview Save button opens, with its back link", () => {
    const check = byPath.get("/sign-up?redirect_url=%2Fitineraries%2Fpreview%3Fcontinue%3Dsave");
    expect(check?.contains).toBe('data-testid="auth-back"');
    expect(read("components/auth/auth-shell.tsx")).toContain(check?.contains);
    expect(read("app/itineraries/preview/preview-client.tsx")).toContain("encodeURIComponent(`${GENERATED_PREVIEW_PATH}?continue=save`)");
    expect(`/sign-up?redirect_url=${encodeURIComponent(`${GENERATED_PREVIEW_PATH}?continue=save`)}`).toBe(new URL(check!.url).pathname + new URL(check!.url).search);
  });
});
