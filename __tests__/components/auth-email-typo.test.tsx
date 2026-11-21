import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: {} }));
import { SignInForm, SignUpForm } from "@/components/auth/auth-forms";
import { emailTypoFix } from "@/lib/auth/email-typo";

// Push BT2: a wrong domain never gets the verify mail; the hint fixes it with one tap.
describe("emailTypoFix", () => {
    it.each([
        ["name@gmial.com", "name@gmail.com"],
        ["name@gmail.con", "name@gmail.com"],
        ["name@gmai.com", "name@gmail.com"],
        ["name@hotmial.com", "name@hotmail.com"],
        ["name@yahoo.con", "name@yahoo.com"],
        ["name@outlok.com", "name@outlook.com"],
        ["name@icloud.con", "name@icloud.com"],
        ["name@naver.con", "name@naver.com"],
        ["  Kim.Lee@GMIAL.COM ", "Kim.Lee@gmail.com"],
    ])("%s -> %s", (typo, fixed) => expect(emailTypoFix(typo)).toBe(fixed));

    it.each(["name@gmail.com", "name@naver.com", "name@company.co", "name@gmail.co.kr", "name", "name@", "@gmial.com", ""])(
        "no hint for %j", (email) => expect(emailTypoFix(email)).toBeNull(),
    );
});

describe.each([
    ["sign-up", () => <SignUpForm googleEnabled={false} />],
    ["sign-in", () => <SignInForm googleEnabled={false} />],
])("%s email field", (_name, form) => {
    it("offers the fix and applies it on tap", () => {
        render(form());
        const field = screen.getByLabelText("Email") as HTMLInputElement;
        fireEvent.change(field, { target: { value: "kim@gmial.com" } });
        const fix = screen.getByRole("button", { name: "kim@gmail.com" });
        expect(fix.getAttribute("type")).toBe("button");
        expect(screen.getByText(/Did you mean/)).toBeTruthy();
        fireEvent.click(fix);
        expect(field.value).toBe("kim@gmail.com");
        expect(screen.queryByText(/Did you mean/)).toBeNull();
    });

    it("shows no hint for a correct domain", () => {
        render(form());
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "kim@gmail.com" } });
        expect(screen.queryByText(/Did you mean/)).toBeNull();
    });
});
