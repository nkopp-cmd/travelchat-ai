import { clsx as cn } from "clsx";

// Server-safe logo body: no hooks and no next/image, so a server page (the home footer) ships no client code for it and
// the layout chunk no longer carries next/image (Push BE3). The two WebP files are 48 px and 96 px copies of the app icon.
export const LOGO_SRC = "/brand/logo-v1-48.webp";
export const LOGO_SRCSET = "/brand/logo-v1-48.webp 1x, /brand/logo-v1-96.webp 2x";

const sizeConfig = {
  sm: { icon: 28, text: "text-lg" },
  md: { icon: 36, text: "text-xl" },
  lg: { icon: 48, text: "text-2xl" },
};

export interface LogoMarkProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
  isLanding?: boolean;
}

export const LOGO_LINK_CLASS = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full";

export function LogoMark({ size = "md", showText = true, className, isLanding = false }: LogoMarkProps) {
  const config = sizeConfig[size];
  return (
    <div className={cn("flex items-center gap-2 group", className)}>
      <div
        className={cn(
          "relative flex-shrink-0 rounded-full overflow-hidden",
          "shadow-lg shadow-violet-500/30",
          "transition-all group-hover:scale-110 group-hover:shadow-violet-500/40"
        )}
        style={{ width: config.icon, height: config.icon }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static 1.4 KB WebP; next/image cost ~5 KB gzip JS per page */}
        <img
          src={LOGO_SRC}
          srcSet={LOGO_SRCSET}
          // Decorative next to the "Localley" text (axe image-redundant-alt); names the link alone.
          alt={showText ? "" : "Localley"}
          width={config.icon}
          height={config.icon}
          className="size-full object-cover"
          decoding="async"
          // Eager, but no preload: a high-priority logo competed with the landing hero (LCP) on mobile. React's SSR
          // adds <link rel=preload> for every non-lazy <img> unless fetchPriority is "low".
          loading="eager"
          fetchPriority="low"
        />
      </div>
      {showText && (
        <span
          className={cn(
            config.text,
            // sr-only below sm keeps the link's name "Localley" for screen readers on mobile.
            "font-bold transition-colors sr-only sm:not-sr-only sm:inline-block",
            isLanding
              ? "text-white"
              : "bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600"
          )}
        >
          Localley
        </span>
      )}
    </div>
  );
}
