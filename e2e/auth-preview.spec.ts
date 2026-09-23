import { expect, test, type Page } from "@playwright/test";

/**
 * Better Auth end-to-end flow on the PREVIEW Worker (separate preview auth D1, mail outbox).
 *
 *   PLAYWRIGHT_BASE_URL=https://localley-next-preview.nkopp.workers.dev \
 *     npx playwright test e2e/auth-preview.spec.ts
 *
 * Needs AUTH_MAIL_MODE=outbox on the target: links are read from /api/test-auth/outbox.
 * Never run against production (the outbox route is 404 there and the test skips).
 */
const TEST_DOMAIN = "preview.localley.test";

async function latestLink(page: Page, email: string, kind: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await page.request.get(`/api/test-auth/outbox?email=${encodeURIComponent(email)}`);
    expect(response.status()).toBe(200);
    const { messages } = await response.json() as { messages: Array<{ kind: string; url: string }> };
    const hit = messages.find((m) => m.kind === kind);
    if (hit) return hit.url;
    await page.waitForTimeout(500);
  }
  throw new Error(`no ${kind} mail for test user`);
}

test.beforeAll(async ({ request }) => {
  const probe = await request.get(`/api/test-auth/outbox?email=probe@${TEST_DOMAIN}`);
  test.skip(probe.status() === 404, "target has no test outbox (production?)");
});

test("sign-up -> verify -> protected page -> sign-out -> password sign-in -> magic link", async ({ page }) => {
  const email = `e2e-${Date.now()}@${TEST_DOMAIN}`;
  const password = `E2e-${Math.random().toString(36).slice(2)}-pw`;

  // Signed out: protected page redirects to sign-in with a local continuation.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fdashboard/);
  const api = await page.request.post("/api/spots/save", { data: { spotId: "x" } });
  expect(api.status()).toBe(401);

  // Sign up.
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Check your inbox/)).toBeVisible();

  // Verify email -> auto sign-in -> dashboard.
  await page.goto(await latestLink(page, email, "verify-email"));
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  const session = await page.request.get("/api/auth/get-session");
  const body = await session.json();
  expect(body.user.email).toBe(email);
  expect(body.user.emailVerified).toBe(true);
  await page.screenshot({ path: "test-results/auth-preview-dashboard.png", fullPage: false });

  // Sign out through the account menu.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fsettings/);

  // Password sign-in returns to the requested page.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/settings/);
  await page.screenshot({ path: "test-results/auth-preview-settings.png", fullPage: false });

  // Magic link sign-in after clearing cookies.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/sent you a sign-in link/)).toBeVisible();
  await page.goto(await latestLink(page, email, "magic-link"));
  await page.waitForURL(/\/dashboard/);
  expect((await (await page.request.get("/api/auth/get-session")).json()).user.email).toBe(email);
});
