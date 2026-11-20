import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";

// Push BB1: an account email links to /sign-in?redirect_url=/settings. A visitor who is already signed in must go
// straight on (no second sign-in); a signed-out visitor gets the form; a foreign target falls back to /dashboard.
const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, isGoogleSignInEnabled: () => false }));
vi.mock("@/components/auth/auth-forms", () => ({ SignInForm: () => null, SignUpForm: () => null }));
vi.mock("@/components/auth/auth-shell", () => ({ AuthShell: (props: { title: string }) => React.createElement("div", props) }));
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";

const pages = { "sign-in": SignInPage, "sign-up": SignUpPage } as const;
const render = (page: keyof typeof pages, redirect_url?: string | string[]) =>
  pages[page]({ searchParams: Promise.resolve({ redirect_url }) });

afterEach(() => vi.clearAllMocks());

describe("auth pages forward a signed-in visitor (Push BB1)", () => {
  for (const page of ["sign-in", "sign-up"] as const) {
    it(`${page}: signed in -> redirect_url`, async () => {
      mocks.auth.mockResolvedValue({ userId: "user_one" });
      await expect(render(page, "/settings")).rejects.toThrow("REDIRECT /settings");
      await expect(render(page, ["/pricing?checkout=pro-monthly", "/x"])).rejects.toThrow("REDIRECT /pricing?checkout=pro-monthly");
    });

    it(`${page}: signed in with an unsafe or missing target -> /dashboard`, async () => {
      mocks.auth.mockResolvedValue({ userId: "user_one" });
      for (const target of ["//evil.example/x", "https://evil.example/", undefined]) {
        await expect(render(page, target)).rejects.toThrow("REDIRECT /dashboard");
      }
    });

    it(`${page}: signed out -> the form, no redirect`, async () => {
      mocks.auth.mockResolvedValue({ userId: null });
      const element = await render(page, "/settings") as React.ReactElement<{ title: string }>;
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(typeof element.props.title).toBe("string");
    });
  }
});
