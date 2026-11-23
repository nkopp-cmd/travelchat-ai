import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/components/brand/logo", () => ({ Logo: () => null }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import { AuthShell } from "@/components/auth/auth-shell";
import { AUTH_ENTRY_LINKS, SIGN_IN_LEAD } from "@/lib/auth/auth-copy";

// Push BS1: the sign-up footer named the terms as plain text; a visitor could not read them without leaving the form.
describe("auth form footer links the legal pages (Push BS1)", () => {
  it.each([["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"]])("%s links to %s in a new tab", (name, href) => {
    render(<AuthShell title="Join Localley" subtitle="Free">form</AuthShell>);
    const link = screen.getByRole("link", { name });
    expect(link.getAttribute("href")).toBe(href);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("a page with its own footer keeps it", () => {
    render(<AuthShell title="t" subtitle="s" footer={<p>Own footer</p>}>form</AuthShell>);
    expect(screen.queryByRole("link", { name: "Terms of Service" })).toBeNull();
    expect(screen.getByText("Own footer")).not.toBeNull();
  });
});

describe("bare auth form offers a way on without an account (Push CJ1)", () => {
  it("renders the planner and spots links under the form", () => {
    render(<AuthShell title="t" subtitle="s" entry={AUTH_ENTRY_LINKS}>form</AuthShell>);
    const nav = screen.getByRole("navigation", { name: "Without an account" });
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/itineraries/new", "/spots"]);
    expect(screen.getByRole("link", { name: /Plan a free trip, no account needed/ })).not.toBeNull();
  });

  it("renders no nav when there are no links", () => {
    render(<AuthShell title="t" subtitle="s" entry={[]}>form</AuthShell>);
    expect(screen.queryByRole("navigation", { name: "Without an account" })).toBeNull();
  });
});

describe("bare sign-in shows the free planner above the form (Push CM1)", () => {
  it("renders the lead link before the form", () => {
    const { container } = render(<AuthShell title="t" subtitle="s" lead={SIGN_IN_LEAD}><div data-testid="form">form</div></AuthShell>);
    const lead = screen.getByTestId("auth-lead");
    expect(lead.getAttribute("href")).toBe("/itineraries/new");
    expect(lead.textContent).toContain("New to Localley? Plan a free trip, no account needed");
    const form = screen.getByTestId("form");
    expect(lead.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("[data-testid=auth-lead]").length).toBe(1);
  });

  it("is a plain anchor, so the planner load reaches CF RUM with the auth page as referrer (Push DB1)", () => {
    render(<AuthShell title="t" subtitle="s" lead={SIGN_IN_LEAD}>form</AuthShell>);
    const lead = screen.getByTestId("auth-lead");
    expect(lead.tagName).toBe("A");
    expect(lead.getAttribute("href")).toBe("/itineraries/new");
    expect(lead.getAttribute("target")).toBeNull();
  });

  it("renders no lead without one", () => {
    render(<AuthShell title="t" subtitle="s" lead={null}>form</AuthShell>);
    expect(screen.queryByTestId("auth-lead")).toBeNull();
  });
});
