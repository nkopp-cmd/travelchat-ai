// Push BN1: social apps (TikTok, Instagram, Facebook, LINE, Snapchat ...) open links in their own WebView. Google
// refuses OAuth there (403 disallowed_useragent), so the sign-up page hides the Google button inside them.
// Client-only check: the sign-up HTML stays edge-cached and identical for every visitor.
import { useSyncExternalStore } from "react";

const IN_APP = /\b(FBAN|FBAV|FB_IAB|FBIOS|Instagram|musical_ly|BytedanceWebview|TikTok|Line\/|Snapchat|Twitter|Pinterest|LinkedInApp|KAKAOTALK|NAVER\(inapp|WhatsApp|MicroMessenger|; wv\))/i;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return typeof userAgent === "string" && IN_APP.test(userAgent);
}

const noop = () => () => {};
export function useInAppBrowser(): boolean {
  return useSyncExternalStore(noop, () => isInAppBrowser(navigator.userAgent), () => false);
}
