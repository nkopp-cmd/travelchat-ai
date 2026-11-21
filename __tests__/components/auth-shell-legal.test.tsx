import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/components/brand/logo", () => ({ Logo: () => null }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import { AuthShell } from "@/components/auth/auth-shell";

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
