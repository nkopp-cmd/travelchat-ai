import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  query: "",
  requestPasswordReset: vi.fn<(body: { email: string; redirectTo: string }) => Promise<{ error: null }>>(async () => ({ error: null })),
  social: vi.fn<(body: { provider: string; callbackURL: string; errorCallbackURL: string }) => Promise<void>>(async () => undefined),
  magicLink: vi.fn<(body: { email: string; callbackURL: string; errorCallbackURL: string }) => Promise<{ error: null }>>(async () => ({ error: null })),
  resetPassword: vi.fn<(body: { newPassword: string; token: string }) => Promise<{ error: null }>>(async () => ({ error: null })),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { requestPasswordReset: state.requestPasswordReset, resetPassword: state.resetPassword, signIn: { social: state.social, magicLink: state.magicLink } } }));
import { appendQueryParams } from "@better-auth/core/utils/url";
import { ForgotPasswordForm, ResetPasswordForm, SignInForm, SignUpForm, withReturn } from "@/components/auth/auth-forms";

const at = (href: string | null) => new URL(href!, "https://www.localley.io");
const TARGETS = ["/pricing?checkout=pro-monthly", "/itineraries/new?resume=1", "/itineraries/preview", "/spots/abc/tips"];

beforeEach(() => { state.query = ""; state.requestPasswordReset.mockClear(); state.resetPassword.mockClear(); state.social.mockClear(); state.magicLink.mockClear(); });

describe("password reset keeps the return path", () => {
  it.each(TARGETS)("sign-in -> forgot -> reset mail -> reset done -> sign-in keeps %s", async target => {
    state.query = new URLSearchParams({ redirect_url: target }).toString();
    const signin = render(<SignInForm googleEnabled={false} />);
    const forgot = at(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href"));
    expect(forgot.pathname).toBe("/forgot-password");
    expect(forgot.searchParams.get("redirect_url")).toBe(target);
    signin.unmount();

    // The forgot page reads redirect_url on the server and passes it in.
    const page = render(<ForgotPasswordForm redirectTo={forgot.searchParams.get("redirect_url")!} />);
    expect(at(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).searchParams.get("redirect_url")).toBe(target);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "reader@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(state.requestPasswordReset).toHaveBeenCalledTimes(1));
    const mailReturn = at(state.requestPasswordReset.mock.calls[0][0].redirectTo);
    expect(mailReturn.pathname).toBe("/reset-password");
    expect(mailReturn.searchParams.get("redirect_url")).toBe(target);
    page.unmount();

    // Better Auth appends ?token=... to that callback (redirectCallback keeps the existing query).
    mailReturn.searchParams.set("token", "t1");
    state.query = mailReturn.searchParams.toString();
    render(<ResetPasswordForm />);
    expect(at(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).searchParams.get("redirect_url")).toBe(target);
    fireEvent.change(screen.getByLabelText("New password (8+ characters)"), { target: { value: "longpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    const signIn = at((await screen.findByRole("link", { name: "Sign in" })).getAttribute("href"));
    expect(signIn.pathname).toBe("/sign-in");
    expect(signIn.searchParams.get("redirect_url")).toBe(target);
    expect(state.resetPassword).toHaveBeenCalledWith({ newPassword: "longpassword", token: "t1" });
  });

  it("adds nothing for the default return and drops a foreign one", () => {
    expect(withReturn("/sign-in", "/dashboard")).toBe("/sign-in");
    expect(withReturn("/sign-in", "//example.invalid")).toBe("/sign-in");
    expect(withReturn("/reset-password", "https://example.invalid/x")).toBe("/reset-password");
    expect(withReturn("/sign-in?error=google", "/pricing")).toBe("/sign-in?error=google&redirect_url=%2Fpricing");
    state.query = "redirect_url=%2F%2Fexample.invalid";
    render(<SignInForm googleEnabled={false} />);
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("sends the plain reset path without a return page", async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "reader@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(state.requestPasswordReset).toHaveBeenCalledWith({ email: "reader@example.invalid", redirectTo: "/reset-password" }));
  });
});

describe("failed Google and email-link sign-in keep the return path", () => {
  it.each(TARGETS)("Google error return keeps %s on sign-in and sign-up", async target => {
    for (const Form of [SignInForm, SignUpForm]) {
      state.query = new URLSearchParams({ redirect_url: target }).toString();
      state.social.mockClear();
      const view = render(<Form googleEnabled />);
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
      await waitFor(() => expect(state.social).toHaveBeenCalledTimes(1));
      const body = state.social.mock.calls[0][0];
      expect(body.callbackURL).toBe(target);
      // Better Auth's OAuth callback appends its own error code to errorCallbackURL.
      const back = at(appendQueryParams(body.errorCallbackURL, new URLSearchParams({ error: "access_denied" })));
      expect(back.pathname).toBe("/sign-in");
      expect(back.searchParams.get("redirect_url")).toBe(target);
      view.unmount();

      state.query = back.searchParams.toString();
      const signin = render(<SignInForm googleEnabled />);
      expect(screen.getByText(/Google sign-in did not finish/)).toBeTruthy();
      expect(at(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).searchParams.get("redirect_url")).toBe(target);
      signin.unmount();
    }
  });

  it.each(TARGETS)("email-link error return keeps %s", async target => {
    state.query = new URLSearchParams({ redirect_url: target }).toString();
    render(<SignInForm googleEnabled={false} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "reader@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    await waitFor(() => expect(state.magicLink).toHaveBeenCalledTimes(1));
    const body = state.magicLink.mock.calls[0][0];
    expect(body.callbackURL).toBe(target);
    // The magic-link verify route sets error=<code> on errorCallbackURL.
    const back = at(body.errorCallbackURL);
    back.searchParams.set("error", "INVALID_TOKEN");
    expect(back.pathname).toBe("/sign-in");
    expect(back.searchParams.get("redirect_url")).toBe(target);
  });

  it("keeps the plain error paths without a return page and for a foreign one", async () => {
    for (const query of ["", "redirect_url=%2F%2Fexample.invalid"]) {
      state.query = query; state.social.mockClear();
      const view = render(<SignInForm googleEnabled />);
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
      await waitFor(() => expect(state.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/dashboard", errorCallbackURL: "/sign-in?error=google" }));
      view.unmount();
    }
    state.query = "error=INVALID_TOKEN";
    render(<SignInForm googleEnabled={false} />);
    expect(screen.getByText("That link is invalid or expired. Please try again.")).toBeTruthy();
  });
});

