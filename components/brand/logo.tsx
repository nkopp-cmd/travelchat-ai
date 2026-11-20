"use client";

import { IntentLink } from "@/components/navigation/intent-link";
import { useUser } from "@/lib/auth/client";
import { LOGO_LINK_CLASS, LogoMark, type LogoMarkProps } from "@/components/brand/logo-mark";

interface LogoProps extends LogoMarkProps {
  href?: string;
}

/** Header logo: links to the dashboard when signed in. Server pages that link to "/" use LogoMark in a Link instead. */
export function Logo({ href, ...mark }: LogoProps) {
  const { isSignedIn } = useUser();
  // Default href: dashboard if signed in, landing page if not
  const resolvedHref = href ?? (isSignedIn ? "/dashboard" : "/");
  return <IntentLink href={resolvedHref} className={LOGO_LINK_CLASS}><LogoMark {...mark} /></IntentLink>;
}
