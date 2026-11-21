import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: {} }));
import { PasswordInput, ResetPasswordForm, SignInForm, SignUpForm } from "@/components/auth/auth-forms";

describe("password show/hide (Push BT1)", () => {
    it("switches the input between password and text, and renames the button", () => {
        render(<PasswordInput id="pw" defaultValue="secret12" />);
        const input = document.getElementById("pw") as HTMLInputElement;
        expect(input.type).toBe("password");
        fireEvent.click(screen.getByRole("button", { name: "Show password" }));
        expect(input.type).toBe("text");
        expect(input.value).toBe("secret12");
        fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
        expect(input.type).toBe("password");
    });
    it.each([
        ["sign-up", () => <SignUpForm googleEnabled={false} />],
        ["sign-in", () => <SignInForm googleEnabled={false} />],
        ["reset", () => <ResetPasswordForm />],
    ])("the %s form has the toggle and it does not submit", (_name, Form) => {
        render(<Form />);
        const toggle = screen.getByRole("button", { name: "Show password" });
        expect(toggle.getAttribute("type")).toBe("button");
        expect(toggle.getAttribute("aria-controls")).toBe("password");
    });
});

describe("password toggle guard (Push BT4)", () => {
    it("no auth component renders a raw type=\"password\" input", () => {
        const dir = "components/auth";
        for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx"))) {
            expect(readFileSync(`${dir}/${file}`, "utf8"), file).not.toMatch(/type=["']password["']/);
        }
    });
});

// Push BV1/BV2: the toggle sits on the field fill, so it must use the field ink. text-primary (#b9a1ff)
// on the field (#8c96b2) was 1.34:1 (axe serious, live 2026-11-21).
const rgb = (name: string) => {
    const css = readFileSync("styles/borderless-tokens.css", "utf8");
    const m = css.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`));
    if (!m) throw new Error(`token --${name} missing`);
    return m.slice(1, 4).map(Number);
};
const luminance = ([r, g, b]: number[]) =>
    [r, g, b].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("password toggle contrast (Push BV1/BV2)", () => {
    it("the toggle uses the field ink, not the brand violet", () => {
        render(<PasswordInput id="pw2" />);
        const toggle = screen.getByRole("button", { name: "Show password" });
        expect(toggle.className).toContain("text-field-foreground");
        expect(toggle.className).not.toMatch(/\btext-primary\b/);
    });
    it("field ink on the field fill is at least 4.5:1 (WCAG AA body text)", () => {
        expect(ratio(rgb("ll-control-ink"), rgb("ll-control"))).toBeGreaterThanOrEqual(4.5);
    });
});
