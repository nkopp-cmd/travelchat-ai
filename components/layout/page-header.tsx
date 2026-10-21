import type { ComponentType, ReactNode } from "react";
import { GradientText } from "@/components/ui/gradient-text";
import { cn } from "@/lib/utils";

/**
 * The one page header pattern (shared/plans/localley-design-consistency.md, reference /spots):
 * eyebrow chip, display title, one-line lede, optional primary action. Left aligned on every page.
 */
export function PageEyebrow({ icon: Icon, children, className }: {
    icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[13px] font-medium text-foreground", className)}>
            {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden="true" />}
            {children}
        </div>
    );
}

export function PageHeader({ eyebrow, eyebrowIcon, title, lede, actions, className }: {
    eyebrow?: ReactNode;
    eyebrowIcon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
    title: ReactNode;
    lede?: ReactNode;
    /** Primary (and at most one secondary) action, right of the title from sm up. */
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
            <div className="min-w-0 max-w-2xl">
                {eyebrow && <PageEyebrow icon={eyebrowIcon} className="mb-3">{eyebrow}</PageEyebrow>}
                <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-4xl">
                    <GradientText variant="violet">{title}</GradientText>
                </h1>
                {lede && <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{lede}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}
