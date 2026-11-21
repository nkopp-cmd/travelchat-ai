import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
import { SignInForm, SignUpForm } from "@/components/auth/auth-forms";
import { isInAppBrowser } from "@/lib/in-app-browser";

const IN_APP = {
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 619567012)",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 [FBAN/FBIOS;FBAV/460.0.0.36.106;FBBV/580000000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  tiktok: "Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 trill_330604 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/33.6.4 ByteLocale/en BytedanceWebview/d8a21c6",
  tiktokIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0",
  kakaotalk: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36",
};
const BROWSERS = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
};

describe("isInAppBrowser", () => {
  it.each(Object.entries(IN_APP))("%s WebView = true", (_, ua) => expect(isInAppBrowser(ua)).toBe(true));
  it.each(Object.entries(BROWSERS))("%s = false", (_, ua) => expect(isInAppBrowser(ua)).toBe(false));
  it("missing UA = false", () => { expect(isInAppBrowser(undefined)).toBe(false); expect(isInAppBrowser("")).toBe(false); });
});

describe("Google option on the account forms", () => {
  afterEach(() => vi.restoreAllMocks());
  const setUA = (ua: string) => vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);

  it.each([["sign-up", SignUpForm], ["sign-in", SignInForm]] as const)("%s hides Google inside Instagram and shows the email hint", (_, Form) => {
    setUA(IN_APP.instagram);
    render(<Form googleEnabled />);
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.getByTestId("auth-inapp-hint").textContent).toContain("Use your email below");
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it.each([["sign-up", SignUpForm], ["sign-in", SignInForm]] as const)("%s keeps Google in Safari", (_, Form) => {
    setUA(BROWSERS.iosSafari);
    render(<Form googleEnabled />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.queryByTestId("auth-inapp-hint")).toBeNull();
  });

  it("shows neither when Google is off", () => {
    setUA(IN_APP.instagram);
    render(<SignUpForm googleEnabled={false} />);
    expect(screen.queryByTestId("auth-inapp-hint")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });
});
