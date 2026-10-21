"use client";

import type { RefObject } from "react";
import { IntentLink } from "@/components/navigation/intent-link";
import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { mobileRoutes } from "@/components/layout/navbar-routes";

export function NavbarDrawer({ open, onOpenChange, returnFocusTo, pathname, isLanding }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocusTo: RefObject<HTMLButtonElement | null>; pathname: string; isLanding: boolean }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="left" className="w-[86vw] max-w-[340px] p-0" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusTo.current?.focus(); }}>
            <nav aria-label="More places and tools" className="flex min-h-dvh flex-col gap-7 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-6">
              <SheetHeader className="p-0 pr-12"><SheetTitle className="sr-only">Explore Localley</SheetTitle><SheetDescription className="sr-only">Find places, build a trip and manage your account.</SheetDescription><Logo size="md" isLanding={isLanding} /></SheetHeader>
              <div className="space-y-4"><p className="text-lg font-semibold">Where next?</p><p className="text-sm text-muted-foreground">Find places worth a detour. Make room for the day around them.</p><SheetClose asChild><Button asChild className="w-full"><Link href="/itineraries/new">Start planning<ArrowRight className="size-4" /></Link></Button></SheetClose></div>
              <div className="grid gap-2">{mobileRoutes.map(route => <SheetClose asChild key={route.href}>
                <IntentLink href={route.href} aria-current={pathname === route.href ? 'page' : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-muted-foreground hover:bg-raised hover:text-foreground", pathname === route.href && "bg-raised font-semibold text-foreground")}><route.icon className="size-5" /><span className="flex-1">{route.label}</span><ArrowRight className="size-4" /></IntentLink>
              </SheetClose>)}</div>
              <p className="mt-auto text-sm text-muted-foreground">Your places, conversations and trips stay close.</p>
            </nav>
          </SheetContent>
    </Sheet>
  );
}
