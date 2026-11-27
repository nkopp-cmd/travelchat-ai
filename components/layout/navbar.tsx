"use client";

import { IntentLink } from "@/components/navigation/intent-link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/auth/client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefetchInbox } from "@/lib/notifications/inbox-prefetch";
import { Menu } from "@/components/ui/icons";
import { routes } from "@/components/layout/navbar-routes";
import { buttonVariants } from "@/components/ui/button-variants";
import { Logo } from "@/components/brand/logo";
import { returnPath, signInGateHref, signUpGateHref } from "@/lib/auth/gate-href";
import { useScrollDirection } from "@/hooks/use-scroll-direction";

const NavbarAccount = dynamic(() => import("@/components/layout/navbar-account").then((module) => module.NavbarAccount), {
  ssr: false,
  loading: () => <div className="h-11 w-20 rounded-xl bg-raised" aria-hidden="true" />,
});

const loadDrawer = () => import("@/components/layout/navbar-drawer");
const preloadDrawer = () => { void loadDrawer(); };
// The mobile drawer (Radix Dialog) loads on first intent, not with every page.
const NavbarDrawer = dynamic(() => loadDrawer().then((module) => module.NavbarDrawer), { ssr: false });


// Push BE1: the session call takes 0.5-1 s on phones. A browser that never rendered a signed-in header shows
// Sign in + Join free at once (the edge HTML already has them); only a browser with this hint waits for the session.
export const ACCOUNT_HINT_KEY = "localley:account-hint";
const noSubscribe = () => () => {};
const readAccountHint = () => { try { return localStorage.getItem(ACCOUNT_HINT_KEY) === "1"; } catch { return false; } };

export function Navbar() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const accountHint = useSyncExternalStore(noSubscribe, readAccountHint, () => false);
  useEffect(() => {
    if (!isLoaded) return;
    try { if (isSignedIn) localStorage.setItem(ACCOUNT_HINT_KEY, "1"); else localStorage.removeItem(ACCOUNT_HINT_KEY); } catch { /* Storage off: keep the signed-out default. */ }
  }, [isLoaded, isSignedIn]);
  // Start the inbox's first page with the session, not after the lazy account chunk.
  const inboxOwner = isSignedIn && user?.emailVerified ? user.id : null;
  useEffect(() => { if (inboxOwner) prefetchInbox(inboxOwner); }, [inboxOwner]);
  const scrollDirection = useScrollDirection({ threshold: 20 });
  const isLanding = pathname === "/";
  // Push AF3: phones show "Join free" (only one action fits next to Sign in); the visitor returns to this page after sign-up.
  const joinTarget = !pathname || /^\/(?:sign-in|sign-up)(?:\/|$)/.test(pathname) ? "/" : pathname;
  // Push BR2: the query (/spots?city=tokyo) is read from location on intent, so the edge HTML stays static (no
  // useSearchParams bailout). It counts only for the path it was read on; a stale query never follows a navigation.
  const [seenQuery, setSeenQuery] = useState<{ path: string; search: string } | null>(null);
  const readQuery = () => { const { pathname: path, search } = window.location; if (seenQuery?.path !== path || seenQuery.search !== search) setSeenQuery({ path, search }); };
  const returnTo = returnPath(joinTarget === "/" ? "/" : `${joinTarget}${seenQuery?.path === pathname ? seenQuery.search : ""}`);
  // Push BR1: a returning member who signs in from /pricing or a trip comes back there; "/" keeps the /dashboard default.
  const signInHref = returnTo === "/" ? "/sign-in" : signInGateHref(returnTo);
  const joinHref = signUpGateHref(returnTo);
  const authIntent = { onPointerEnter: readQuery, onPointerDown: readQuery, onFocus: readQuery, onTouchStart: readQuery };
  const isHidden = !isLanding && scrollDirection === "down";
  const [menuOpen, setMenuOpen] = useState(false);
  // Stays mounted after the first open so Radix can animate the close and restore focus.
  const [drawerMounted, setDrawerMounted] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return <header data-app-chrome className={`sticky top-0 z-50 w-full bg-background/95 shadow-surface backdrop-blur-xl transition-transform duration-[var(--ll-motion-short)] motion-reduce:transition-none${isHidden ? " -translate-y-full focus-within:translate-y-0 md:translate-y-0" : ""}`}>
    <div className="container flex h-[var(--ll-topbar-height)] items-center justify-between gap-3 px-4">
      <div className="flex items-center gap-2">
        <button type="button" data-slot="button" ref={menuButton} className={`${buttonVariants({ variant: "ghost", size: "icon" })} md:hidden`} aria-label="Open menu" aria-haspopup="dialog" aria-expanded={menuOpen} onPointerEnter={preloadDrawer} onFocus={preloadDrawer} onTouchStart={preloadDrawer} onClick={() => { setDrawerMounted(true); setMenuOpen(true); }}><Menu className="size-5" /></button>
        {drawerMounted && <NavbarDrawer open={menuOpen} onOpenChange={setMenuOpen} returnFocusTo={menuButton} pathname={pathname} isLanding={isLanding} />}
        <Logo size="md" isLanding={isLanding} />
      </div>
      <nav aria-label="Main pages" className="hidden items-center gap-1 md:flex">{routes.map(route => {
        const active = pathname === route.href || (route.href === '/spots' && pathname === '/dashboard');
        return <IntentLink key={route.href} href={route.href} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 lg:px-4 text-sm hover:bg-raised hover:text-foreground ${active ? "bg-raised font-semibold text-foreground" : "text-muted-foreground"}`}><route.icon className="hidden size-4 lg:block" />{route.label}</IntentLink>;
      })}</nav>
      <div className="flex min-h-11 items-center gap-2 sm:gap-4">
        {!isLoaded && accountHint ? <div role="status" aria-label="Checking account" className="h-11 w-20 rounded-xl bg-raised"><span className="sr-only">Checking account</span></div> : isSignedIn ? <NavbarAccount /> : <><IntentLink data-slot="button" className={buttonVariants({ variant: "ghost", size: "sm" })} href={signInHref} {...authIntent}>Sign in</IntentLink><IntentLink data-slot="button" className={`${buttonVariants({ size: "sm" })} sm:hidden`} href={joinHref} {...authIntent}>Join free</IntentLink><IntentLink data-slot="button" className={`${buttonVariants({ size: "sm" }).replace("inline-flex ", "")} hidden sm:inline-flex`} href="/itineraries/new">Start planning</IntentLink></>}
      </div>
    </div>
  </header>;
}
