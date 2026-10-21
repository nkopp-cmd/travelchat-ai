"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";

type IntentLinkProps = Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string };

/**
 * A Link that prefetches on intent (pointer enter, focus, touch start), not on view.
 * Shared chrome links render on every page; viewport prefetch made each signed-in page view
 * trigger 5-7 dynamic RSC renders for routes the visitor usually does not open.
 */
export function IntentLink({ href, onPointerEnter, onFocus, onTouchStart, ...props }: IntentLinkProps) {
    const router = useRouter();
    const prefetched = useRef(false);
    const prefetch = () => {
        if (prefetched.current) return;
        prefetched.current = true;
        router.prefetch(href);
    };
    return (
        <Link
            {...props}
            href={href}
            prefetch={false}
            onPointerEnter={(event) => { prefetch(); onPointerEnter?.(event); }}
            onFocus={(event) => { prefetch(); onFocus?.(event); }}
            onTouchStart={(event) => { prefetch(); onTouchStart?.(event); }}
        />
    );
}
