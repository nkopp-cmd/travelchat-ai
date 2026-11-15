import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { afterAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  const originalFetch = globalThis.fetch;
  const fetch = vi.fn(async () => { throw new Error("No authentication request is allowed in navigation checks"); });
  globalThis.fetch = fetch;
  return { query: "", fetch, originalFetch };
});
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
import { SignInForm, SignUpForm } from "@/components/auth/auth-forms";

afterAll(() => { globalThis.fetch = state.originalFetch; });

describe("authentication form return path", () => {
  it.each(["/itineraries/new?resume=1", "/itineraries/claim", "/itineraries/preview", "/pricing?checkout=pro-monthly"])("keeps %s when switching between account forms", target => {
    state.query = new URLSearchParams({ redirect_url: target }).toString();
    const signup = render(<SignUpForm googleEnabled={false} />);
    const signinURL = new URL(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")!, "https://www.localley.io");
    expect(signinURL.pathname).toBe("/sign-in");
    expect(signinURL.searchParams.get("redirect_url")).toBe(target);
    signup.unmount();
    state.query = signinURL.searchParams.toString();
    render(<SignInForm googleEnabled={false} />);
    const signupURL = new URL(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")!, "https://www.localley.io");
    expect(signupURL.pathname).toBe("/sign-up");
    expect(signupURL.searchParams.get("redirect_url")).toBe(target);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("keeps the existing redirect guard against an external destination", () => {
    state.query = "redirect_url=%2F%2Fexample.invalid";
    render(<SignUpForm googleEnabled={false} />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(state.fetch).not.toHaveBeenCalled();
  });
});

describe("authentication submit buttons", () => {
  // Lighthouse /sign-up 2026-11-15: text-foreground on bg-primary was 1.99:1. The Button default pairs
  // bg-primary with text-primary-foreground (7.9:1), so the forms must not override the text color.
  it.each([["sign up", SignUpForm, "Create account"], ["sign in", SignInForm, "Sign in"]] as const)("keeps the readable primary colors on %s", (_, Form, name) => {
    state.query = "";
    const view = render(<Form googleEnabled={false} />);
    const button = screen.getAllByRole("button", { name }).find(b => b.getAttribute("type") === "submit")!;
    expect(button.className).toContain("text-primary-foreground");
    expect(button.className).not.toMatch(/(^|\s)text-foreground(\s|$)/);
    view.unmount();
  });
});
