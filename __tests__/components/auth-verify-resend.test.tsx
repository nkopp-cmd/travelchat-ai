import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/auth/auth-client", async () => {
  const { createAuthClient } = await import("better-auth/react");
  return { authClient: createAuthClient({ baseURL: "https://www.localley.io", basePath: "/api/auth", fetchOptions: { customFetchImpl: mocks.fetch } }) };
});
import { ResetPasswordForm, RESEND_COOLDOWN_SECONDS, SignInForm, SignUpForm } from "@/components/auth/auth-forms";

const calls = (path: string) => mocks.fetch.mock.calls
  .filter(([url]) => String(url).includes(path))
  .map(([, options]) => JSON.parse(options.body as string));

beforeEach(() => {
  vi.clearAllMocks(); mocks.query = "";
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.fetch.mockImplementation(async (url: string | URL) => {
    if (String(url).includes("/sign-in/email")) {
      return Response.json({ code: "EMAIL_NOT_VERIFIED", message: "Email not verified" }, { status: 403 });
    }
    return Response.json({ status: true, token: null, user: { id: "unit-user" } });
  });
});
afterEach(() => vi.useRealTimers());

async function signUp() {
  render(<SignUpForm googleEnabled={false} />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@preview.localley.test" } });
  fireEvent.change(screen.getByLabelText("Password (8+ characters)"), { target: { value: "unit-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText(/Check your inbox/);
}

async function passCooldown() {
  for (let i = 0; i <= RESEND_COOLDOWN_SECONDS; i++) await act(async () => { vi.advanceTimersByTime(1000); });
}

describe("sign-up form fields (Push BC1)", () => {
  it("asks for email and password first and marks the name as optional", () => {
    render(<SignUpForm googleEnabled={false} />);
    const ids = Array.from(document.querySelectorAll("form input")).map(i => i.id);
    expect(ids).toEqual(["email", "password", "name"]);
    expect((screen.getByLabelText("Name (optional)") as HTMLInputElement).required).toBe(false);
    expect((screen.getByLabelText("Email") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Password (8+ characters)") as HTMLInputElement).required).toBe(true);
  });

  it("signs up without a name: the email prefix becomes the name", async () => {
    await signUp();
    const body = calls("/sign-up/email")[0];
    expect(body).toMatchObject({ email: "new@preview.localley.test", name: "new" });
    expect(body.firstName).toBeUndefined();
  });

  it("splits a typed name into first and last name", async () => {
    render(<SignUpForm googleEnabled={false} />);
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "  Ana  de Souza " } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@preview.localley.test" } });
    fireEvent.change(screen.getByLabelText("Password (8+ characters)"), { target: { value: "unit-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText(/Check your inbox/);
    expect(calls("/sign-up/email")[0]).toMatchObject({ name: "Ana  de Souza", firstName: "Ana", lastName: "de Souza" });
  });
});

describe("sign-up check-inbox screen (Push AH1/AH2)", () => {
  it("sends the checkout page as callbackURL so the verify link returns the new user to checkout", async () => {
    mocks.query = "redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly";
    await signUp();
    expect(calls("/sign-up/email")[0].callbackURL).toBe("/verified?to=%2Fpricing%3Fcheckout%3Dpro-monthly");
  });

  it("falls back to /dashboard for an external redirect", async () => {
    mocks.query = "redirect_url=https%3A%2F%2Fevil.example%2F";
    await signUp();
    expect(calls("/sign-up/email")[0].callbackURL).toBe("/verified?to=%2Fdashboard");
  });

  it("names the address and sender, then resends with the same callbackURL after the cool-down", async () => {
    mocks.query = "redirect_url=%2Fspots%2Fabc";
    await signUp();
    expect(screen.getByText("new@preview.localley.test")).toBeTruthy();
    expect(screen.getByText(/Check Spam or Promotions/)).toBeTruthy();
    const resend = screen.getByRole("button", { name: /Resend link/ }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    await passCooldown();
    expect(resend.disabled).toBe(false);
    fireEvent.click(resend);
    await screen.findByText("We sent a new link to new@preview.localley.test.");
    expect(calls("/send-verification-email")).toEqual([{ email: "new@preview.localley.test", callbackURL: "/verified?to=%2Fspots%2Fabc" }]);
    expect(resend.disabled).toBe(true);
  });

  it("goes back to the form with the email kept", async () => {
    await signUp();
    fireEvent.click(screen.getByRole("button", { name: "Use another email" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("new@preview.localley.test");
    expect((screen.getByLabelText("Password (8+ characters)") as HTMLInputElement).value).toBe("");
  });

  it("lets the visitor retry a dropped verification request with the same email and return URL", async () => {
    mocks.query = "redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly";
    await signUp();
    await passCooldown();
    mocks.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const resend = screen.getByRole<HTMLButtonElement>("button", { name: "Resend link" });
    fireEvent.click(resend);

    expect((await screen.findByRole("alert")).textContent).toMatch(/Check your connection and try again/);
    expect(resend.disabled).toBe(false);
    fireEvent.click(resend);

    await screen.findByText("We sent a new link to new@preview.localley.test.");
    const payload = { email: "new@preview.localley.test", callbackURL: "/verified?to=%2Fpricing%3Fcheckout%3Dpro-monthly" };
    expect(calls("/send-verification-email")).toEqual([payload, payload]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(resend.disabled).toBe(true);
  });
});

describe("sign-in with an unverified email (Push AH4)", () => {
  it("offers the resend block with the page to return to", async () => {
    mocks.query = "redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly";
    render(<SignInForm googleEnabled={false} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "old@preview.localley.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "unit-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
    await screen.findByText(/Please confirm your email first/);
    await passCooldown();
    fireEvent.click(screen.getByRole("button", { name: /Resend link/ }));
    await waitFor(() => expect(calls("/send-verification-email")).toEqual([{ email: "old@preview.localley.test", callbackURL: "/verified?to=%2Fpricing%3Fcheckout%3Dpro-monthly" }]));
  });
});

describe("expired reset-password link (Push AI2)", () => {
  it.each(["error=INVALID_TOKEN", ""])("explains the dead link and offers a new one (%s)", query => {
    mocks.query = query;
    render(<ResetPasswordForm />);
    expect(screen.getByText("This reset link is invalid or expired. Request a new one.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe("/forgot-password");
    expect((screen.getByRole("button", { name: "Set password" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// Push AZ3: the resume actions of AZ1 (/itineraries/preview?continue=save) and AZ2 (/spots/<id>?continue=save-spot:<id>)
// survive every way back: sign-up <-> sign-in links, the sign-in submit, the verify mail and its resend.
describe.each([
  ["/itineraries/preview?continue=save"],
  ["/spots/abc?continue=save-spot%3Aabc"],
])("resume target %s (Push AZ3)", (page) => {
  const query = `redirect_url=${encodeURIComponent(page)}`;
  const linkTarget = (name: string) => new URL(screen.getByRole("link", { name }).getAttribute("href")!, "https://www.localley.io").searchParams.get("redirect_url");

  it("sign-up keeps it in the 'Sign in' link and in the verify mail", async () => {
    mocks.query = query;
    render(<SignUpForm googleEnabled={false} />);
    expect(linkTarget("Sign in")).toBe(page);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@preview.localley.test" } });
    fireEvent.change(screen.getByLabelText("Password (8+ characters)"), { target: { value: "unit-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText(/Check your inbox/);
    expect(calls("/sign-up/email")[0].callbackURL).toBe(`/verified?to=${encodeURIComponent(page)}`);
    await passCooldown();
    fireEvent.click(screen.getByRole("button", { name: /Resend link/ }));
    await waitFor(() => expect(calls("/send-verification-email")[0]?.callbackURL).toBe(`/verified?to=${encodeURIComponent(page)}`));
  });

  it("sign-in keeps it in the 'Sign up' link and as the sign-in callbackURL", async () => {
    mocks.query = query;
    render(<SignInForm googleEnabled={false} />);
    expect(linkTarget("Sign up")).toBe(page);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "member@preview.localley.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "unit-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
    await waitFor(() => expect(calls("/sign-in/email")[0]?.callbackURL).toBe(page));
  });
});


describe("sign-up error paths (Push BC4)", () => {
  function submit() {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taken@preview.localley.test" } });
    fireEvent.change(screen.getByLabelText("Password (8+ characters)"), { target: { value: "unit-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("lets the visitor retry a dropped sign-up request without losing their details", async () => {
    mocks.query = "redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly";
    mocks.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<SignUpForm googleEnabled={false} />);
    submit();

    expect((await screen.findByRole("alert")).textContent).toMatch(/Check your connection and try again/);
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Create account" });
    expect(button.disabled).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe("taken@preview.localley.test");
    fireEvent.click(button);

    await screen.findByText(/Check your inbox/);
    const attempts = calls("/sign-up/email");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ email: "taken@preview.localley.test", callbackURL: "/verified?to=%2Fpricing%3Fcheckout%3Dpro-monthly" });
    expect(attempts[1]).toEqual(attempts[0]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  for (const code of ["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"]) {
    it(`${code}: says the account exists and the Sign in link keeps the checkout redirect`, async () => {
      mocks.query = "redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly";
      mocks.fetch.mockImplementation(async () => Response.json({ code, message: "User already exists" }, { status: 422 }));
      render(<SignUpForm googleEnabled={false} />);
      submit();
      // Push BT3: the error itself links to sign-in and to the reset page, both with the same return target.
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("An account with this email exists. Sign in or reset your password.");
      expect(screen.queryByText(/Check your inbox/)).toBeNull();
      expect(within(alert).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in?redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly");
      expect(within(alert).getByRole("link", { name: "reset your password" }).getAttribute("href")).toBe("/forgot-password?redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly");
      expect((screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement).disabled).toBe(false);
    });
  }

  it("Push BT3: with no return page the exists links carry no redirect_url, and a retry clears the error", async () => {
    mocks.fetch.mockImplementationOnce(async () => Response.json({ code: "USER_ALREADY_EXISTS", message: "User already exists" }, { status: 422 }));
    render(<SignUpForm googleEnabled={false} />);
    submit();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(within(alert).getByRole("link", { name: "reset your password" }).getAttribute("href")).toBe("/forgot-password");
    mocks.fetch.mockImplementationOnce(async () => Response.json({ status: true, token: null, user: { id: "unit-user" } }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText(/Check your inbox/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server message for any other failure, and a fallback when there is none", async () => {
    mocks.fetch.mockImplementationOnce(async () => Response.json({ code: "PASSWORD_TOO_SHORT", message: "Password too short" }, { status: 400 }));
    render(<SignUpForm googleEnabled={false} />);
    submit();
    await screen.findByText("Password too short");
    mocks.fetch.mockImplementationOnce(async () => new Response(null, { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText("Something went wrong. Please try again.");
    expect(screen.queryByText("Password too short")).toBeNull();
  });

  it("disables Create account while the request runs, so a double click sends one sign-up", async () => {
    let release: (r: Response) => void = () => {};
    mocks.fetch.mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
    render(<SignUpForm googleEnabled={false} />);
    submit();
    const button = screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);
    expect(mocks.fetch.mock.calls.filter(([url]) => String(url).includes("/sign-up/email"))).toHaveLength(1);
    await act(async () => { release(Response.json({ status: true, token: null, user: { id: "unit-user" } })); });
    await screen.findByText(/Check your inbox/);
  });
});
