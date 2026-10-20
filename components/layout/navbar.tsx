"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/auth/client";
import { UserMenu } from "@/components/auth/user-menu";
import { ArrowRight, Map, Menu, Compass, Award, Settings, CreditCard, Sparkles } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SubscriptionBadge } from "@/components/subscription";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { Logo } from "@/components/brand/logo";
import { useScrollDirection } from "@/hooks/use-scroll-direction";

const routes = [
  { href: "/spots", label: "Explore", icon: Compass },
  { href: "/itineraries", label: "My trips", icon: Map },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/profile", label: "Profile", icon: Award },
];
const mobileRoutes = [
  ...routes,
  { href: "/templates", label: "Templates", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Navbar() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();
  const scrollDirection = useScrollDirection({ threshold: 20 });
  const isLanding = pathname === "/";
  const isHidden = !isLanding && scrollDirection === "down";
  return <header className={cn("sticky top-0 z-50 w-full bg-background/95 shadow-surface backdrop-blur-xl transition-transform duration-[var(--ll-motion-short)] motion-reduce:transition-none", isHidden && "-translate-y-full md:translate-y-0")}>
    <div className="container flex h-[var(--ll-topbar-height)] items-center justify-between gap-3 px-4">
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu"><Menu className="size-5" /></Button></SheetTrigger>
          <SheetContent side="left" className="w-[86vw] max-w-[340px] p-0">
            <nav aria-label="More places and tools" className="flex min-h-dvh flex-col gap-7 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-6">
              <SheetHeader className="p-0 pr-12"><SheetTitle className="sr-only">Explore Localley</SheetTitle><SheetDescription className="sr-only">Find places, build a trip and manage your account.</SheetDescription><Logo size="md" isLanding={isLanding} /></SheetHeader>
              <div className="space-y-4"><p className="text-lg font-semibold">Where next?</p><p className="text-sm text-muted-foreground">Find places worth a detour. Make room for the day around them.</p><SheetClose asChild><Button asChild className="w-full"><Link href="/itineraries/new">Start planning<ArrowRight className="size-4" /></Link></Button></SheetClose></div>
              <div className="grid gap-2">{mobileRoutes.map(route => <SheetClose asChild key={route.href}>
                <Link href={route.href} aria-current={pathname === route.href ? 'page' : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-muted-foreground hover:bg-raised hover:text-foreground", pathname === route.href && "bg-raised font-semibold text-foreground")}><route.icon className="size-5" /><span className="flex-1">{route.label}</span><ArrowRight className="size-4" /></Link>
              </SheetClose>)}</div>
              <p className="mt-auto text-sm text-muted-foreground">Your places, conversations and trips stay close.</p>
            </nav>
          </SheetContent>
        </Sheet>
        <Logo size="md" isLanding={isLanding} />
      </div>
      <nav aria-label="Main pages" className="hidden items-center gap-1 md:flex">{routes.map(route => {
        const active = pathname === route.href || (route.href === '/spots' && pathname === '/dashboard');
        return <Link key={route.href} href={route.href} aria-current={active ? 'page' : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-raised hover:text-foreground", active && "bg-raised font-semibold text-foreground")}><route.icon className="size-4" />{route.label}</Link>;
      })}</nav>
      <div className="flex min-h-11 items-center gap-2 sm:gap-4">
        {!isLoaded ? <div role="status" aria-label="Checking account" className="h-11 w-20 rounded-xl bg-raised"><span className="sr-only">Checking account</span></div> : isSignedIn ? <><SubscriptionBadge className="hidden sm:flex" /><NotificationCenter /><UserMenu /></> : <><Button asChild variant="ghost" size="sm"><Link href="/sign-in">Sign in</Link></Button><Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/itineraries/new">Start planning</Link></Button></>}
      </div>
    </div>
  </header>;
}
