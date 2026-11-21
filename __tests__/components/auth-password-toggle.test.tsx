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
