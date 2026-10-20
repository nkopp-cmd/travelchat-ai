"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/auth/client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Menu } from "@/components/ui/icons";
import { routes } from "@/components/layout/navbar-routes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { useScrollDirection } from "@/hooks/use-scroll-direction";

const NavbarAccount = dynamic(() => import("@/components/layout/navbar-account").then((module) => module.NavbarAccount), {
  ssr: false,
  loading: () => <div className="h-11 w-20 rounded-xl bg-raised" aria-hidden="true" />,
});

const loadDrawer = () => import("@/components/layout/navbar-drawer");
const preloadDrawer = () => { void loadDrawer(); };
// The mobile drawer (Radix Dialog) loads on first intent, not with every page.
const NavbarDrawer = dynamic(() => loadDrawer().then((module) => module.NavbarDrawer), { ssr: false });


export function Navbar() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();
  const scrollDirection = useScrollDirection({ threshold: 20 });
  const isLanding = pathname === "/";
  const isHidden = !isLanding && scrollDirection === "down";
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className={cn("sticky top-0 z-50 w-full bg-background/95 shadow-surface backdrop-blur-xl transition-transform duration-[var(--ll-motion-short)] motion-reduce:transition-none", isHidden && "-translate-y-full md:translate-y-0")}>
    <div className="container flex h-[var(--ll-topbar-height)] items-center justify-between gap-3 px-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={menuOpen} onPointerEnter={preloadDrawer} onFocus={preloadDrawer} onTouchStart={preloadDrawer} onClick={() => setMenuOpen(true)}><Menu className="size-5" /></Button>
        {menuOpen && <NavbarDrawer open onOpenChange={setMenuOpen} pathname={pathname} isLanding={isLanding} />}
        <Logo size="md" isLanding={isLanding} />
      </div>
      <nav aria-label="Main pages" className="hidden items-center gap-1 md:flex">{routes.map(route => {
        const active = pathname === route.href || (route.href === '/spots' && pathname === '/dashboard');
        return <Link key={route.href} href={route.href} aria-current={active ? 'page' : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-raised hover:text-foreground", active && "bg-raised font-semibold text-foreground")}><route.icon className="size-4" />{route.label}</Link>;
      })}</nav>
      <div className="flex min-h-11 items-center gap-2 sm:gap-4">
        {!isLoaded ? <div role="status" aria-label="Checking account" className="h-11 w-20 rounded-xl bg-raised"><span className="sr-only">Checking account</span></div> : isSignedIn ? <NavbarAccount /> : <><Button asChild variant="ghost" size="sm"><Link href="/sign-in">Sign in</Link></Button><Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/itineraries/new">Start planning</Link></Button></>}
      </div>
    </div>
  </header>;
}
