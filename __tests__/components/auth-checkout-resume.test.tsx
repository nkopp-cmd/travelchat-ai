// Push CJ4: the money path /pricing -> sign-up (email or Google) -> back to /pricing?checkout=<plan> -> Stripe.
// Each step is checked with the real helpers; only the Better Auth network client is mocked.
import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: "",
  signUpEmail: vi.fn<(arg: Record<string, unknown>) => Promise<{ error: null }>>(async () => ({ error: null })),
  signInEmail: vi.fn<(arg: Record<string, unknown>) => Promise<{ error: null }>>(async () => ({ error: null })),
  signInSocial: vi.fn<(arg: Record<string, unknown>) => Promise<{ error: null }>>(async () => ({ error: null })),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/lib/in-app-browser", () => ({ useInAppBrowser: () => false, isInAppBrowser: () => false }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    signUp: { email: state.signUpEmail },
    signIn: { email: state.signInEmail, social: state.signInSocial, magicLink: vi.fn(async () => ({ error: null })) },
    sendVerificationEmail: vi.fn(async () => ({ error: null })),
  },
}));

import { SignInForm, SignUpForm } from "@/components/auth/auth-forms";
import { GET as verifiedHop } from "@/app/verified/route";
import { wrapVerifyMailURL } from "@/lib/auth/redirect";
import { checkoutSignUpUrl, parseCheckoutIntent, parsePlannerLimit, type CheckoutCycle, type CheckoutTier } from "@/lib/pricing-checkout";

const ORIGIN = "https://www.localley.io";
const PLANS: [CheckoutTier, CheckoutCycle][] = [["pro", "monthly"], ["pro", "yearly"], ["premium", "monthly"], ["premium", "yearly"]];

/** The query the sign-up page gets when a visitor taps "Subscribe" on /pricing while signed out. */
function signUpQuery(tier: CheckoutTier, cycle: CheckoutCycle): string {
  return new URL(checkoutSignUpUrl(tier, cycle), ORIGIN).search;
}

/** Where the browser lands after Better Auth follows `callbackURL` (relative paths resolve on our origin). */
function landing(callbackURL: string): URL {
  const first = new URL(callbackURL, ORIGIN);
  if (first.pathname !== "/verified") return first;
  return new URL(verifiedHop(new NextRequest(first)).headers.get("location")!);
}

beforeEach(() => { vi.clearAllMocks(); });

describe("checkout intent survives account creation (Push CJ4)", () => {
  it.each(PLANS)("email sign-up for %s %s: the verify mail returns to /pricing with the plan", async (tier, cycle) => {
    state.query = signUpQuery(tier, cycle);
    render(<SignUpForm googleEnabled={false} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "buyer@example.com" } });
    fireEvent.change(screen.getByLabelText("Password (8+ characters)"), { target: { value: "correct-horse-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(state.signUpEmail).toHaveBeenCalledTimes(1));
    const callbackURL = state.signUpEmail.mock.calls[0][0].callbackURL as string;

    // The server wraps the mail link (sendVerificationEmail hook); the click then goes /verified -> /pricing.
    const mail = wrapVerifyMailURL(`${ORIGIN}/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(callbackURL)}`);
    expect(new URL(mail).searchParams.get("callbackURL")).toBe(callbackURL);
    const page = landing(callbackURL);
    expect(page.origin).toBe(ORIGIN);
    expect(page.pathname).toBe("/pricing");
    expect(parseCheckoutIntent(page.search)).toEqual({ tier, cycle });
  });

  it.each(PLANS)("Google from sign-up for %s %s: OAuth returns to /pricing with the plan; a failure keeps it too", async (tier, cycle) => {
    state.query = signUpQuery(tier, cycle);
    render(<SignUpForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(state.signInSocial).toHaveBeenCalledTimes(1));
    const { provider, callbackURL, errorCallbackURL } = state.signInSocial.mock.calls[0][0] as Record<string, string>;
    expect(provider).toBe("google");
    const page = landing(callbackURL);
    expect(page.pathname).toBe("/pricing");
    expect(parseCheckoutIntent(page.search)).toEqual({ tier, cycle });

    const failed = new URL(errorCallbackURL, ORIGIN);
    expect(failed.pathname).toBe("/sign-in");
    expect(parseCheckoutIntent(new URL(failed.searchParams.get("redirect_url")!, ORIGIN).search)).toEqual({ tier, cycle });
  });

  it("an existing account that signs in instead still reaches /pricing with the plan", async () => {
    state.query = signUpQuery("premium", "yearly");
    render(<SignInForm googleEnabled={false} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "buyer@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "correct-horse-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" }).find((b) => b.getAttribute("type") === "submit")!);
    await waitFor(() => expect(state.signInEmail).toHaveBeenCalledTimes(1));
    const page = landing(state.signInEmail.mock.calls[0][0].callbackURL as string);
    expect(page.pathname).toBe("/pricing");
    expect(parseCheckoutIntent(page.search)).toEqual({ tier: "premium", cycle: "yearly" });
  });

  it.each(["sign-up", "sign-in"] as const)("keeps the planner limit through %s and the link to the other auth form", async (mode) => {
    const signUp = new URL(checkoutSignUpUrl("pro", "yearly", { resets: "2026-12-01" }), ORIGIN);
    state.query = signUp.search;
    const target = signUp.searchParams.get("redirect_url");
    const signingUp = mode === "sign-up";
    render(signingUp ? <SignUpForm googleEnabled={false} /> : <SignInForm googleEnabled={false} />);

    const link = screen.getByRole("link", { name: signingUp ? "Sign in" : "Sign up" });
    const alternative = new URL(link.getAttribute("href")!, ORIGIN);
    expect(alternative.pathname).toBe(signingUp ? "/sign-in" : "/sign-up");
    expect(alternative.searchParams.get("redirect_url")).toBe(target);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "buyer@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "correct-horse-1" } });
    fireEvent.click(screen.getByRole("button", { name: signingUp ? "Create account" : "Sign in" }));
    const submit = signingUp ? state.signUpEmail : state.signInEmail;
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const page = landing(submit.mock.calls[0][0].callbackURL as string);
    expect(page.pathname).toBe("/pricing/upgrade");
    expect(parseCheckoutIntent(page.search)).toEqual({ tier: "pro", cycle: "yearly" });
    expect(parsePlannerLimit(page.search)).toEqual({ resets: "2026-12-01" });
  });

  it("a forged redirect_url never sends the buyer off the site", async () => {
    state.query = `?redirect_url=${encodeURIComponent("//evil.example/pricing?checkout=pro-monthly")}`;
    render(<SignUpForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(state.signInSocial).toHaveBeenCalledTimes(1));
    const page = landing(state.signInSocial.mock.calls[0][0].callbackURL as string);
    expect(page.origin).toBe(ORIGIN);
    expect(page.pathname).toBe("/dashboard");
  });
});
