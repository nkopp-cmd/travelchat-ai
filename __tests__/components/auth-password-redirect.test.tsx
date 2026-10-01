import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), navigate: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/auth/client", async () => {
 const { createAuthClient } = await import("better-auth/react");
 const original = await vi.importActual<typeof import("@/lib/auth/client")>("@/lib/auth/client");
 return { ...original, authClient: createAuthClient({ baseURL: "https://www.localley.io", basePath: "/api/auth", fetchOptions: { customFetchImpl: mocks.fetch } }) };
});
import { SignInForm } from "@/components/auth/auth-forms";
beforeEach(() => {
 vi.clearAllMocks(); mocks.query = "";
 const originalWindow = window;
 const location = { origin: "https://www.localley.io", assign: mocks.navigate, get href() { return "https://www.localley.io/sign-in"; }, set href(value: string) { mocks.navigate(value); } };
 vi.stubGlobal("window", new Proxy(originalWindow, { get(target, key) { return key === "location" ? location : Reflect.get(target, key); } }));
 mocks.fetch.mockImplementation(async (_url, options) => {
 const body = JSON.parse(options.body as string);
 return Response.json({ redirect: true, url: body.callbackURL, token: "unit-session", user: { id: "unit-owner" } });
 });
});
afterEach(() => vi.unstubAllGlobals());
function submit() {
 render(<SignInForm googleEnabled={false} />);
 fireEvent.change(screen.getByLabelText("Email"), { target: { value: "qa@preview.localley.test" } });
 fireEvent.change(screen.getByLabelText("Password"), { target: { value: "unit-password" } });
 fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
}
describe("password sign-in with Better Auth's real default redirect plugin", () => {
 it("navigates once after successful password login", async () => {
 submit(); await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1)); await act(async () => {});
 expect(mocks.navigate).toHaveBeenCalledTimes(1); expect((screen.getByRole("button", { name: /Sign in|Signing in/i }) as HTMLButtonElement).disabled).toBe(true);
 expect(mocks.navigate).toHaveBeenCalledWith("/dashboard"); expect(mocks.fetch).toHaveBeenCalledTimes(1);
 });
 it("keeps the requested local destination", async () => {
 mocks.query = "redirect_url=%2Fitineraries%2Fowned-trip"; submit();
 await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1)); await act(async () => {});
 expect(mocks.navigate).toHaveBeenCalledTimes(1); expect((screen.getByRole("button", { name: /Sign in|Signing in/i }) as HTMLButtonElement).disabled).toBe(true); expect(mocks.navigate).toHaveBeenCalledWith("/itineraries/owned-trip");
 });
 it("clamps external destinations before the SDK receives them", async () => {
 mocks.query = "redirect_url=https%3A%2F%2Fevil.example"; submit();
 await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1)); await act(async () => {});
 expect(mocks.navigate).toHaveBeenCalledTimes(1); expect((screen.getByRole("button", { name: /Sign in|Signing in/i }) as HTMLButtonElement).disabled).toBe(true); expect(mocks.navigate).toHaveBeenCalledWith("/dashboard");
 });
 it("stays on the form and reports rejected credentials", async () => {
 mocks.fetch.mockResolvedValue(Response.json({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Rejected" }, { status: 401 })); submit();
 await screen.findByRole("alert"); expect(mocks.navigate).not.toHaveBeenCalled();
 });
});
