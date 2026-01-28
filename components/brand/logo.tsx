"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
  href?: string;
  isLanding?: boolean;
}

const sizeConfig = {
  sm: { icon: 28, text: "text-lg" },
  md: { icon: 36, text: "text-xl" },
  lg: { icon: 48, text: "text-2xl" },
};

export function Logo({
  size = "md",
  showText = true,
  className,
  href = "/",
  isLanding = false,
}: LogoProps) {
  const config = sizeConfig[size];

  const content = (
    <div className={cn("flex items-center gap-2 group", className)}>
      <div
        className={cn(
          "relative flex-shrink-0 rounded-full overflow-hidden",
          "shadow-lg shadow-violet-500/30",
          "transition-all group-hover:scale-110 group-hover:shadow-violet-500/40"
        )}
        style={{ width: config.icon, height: config.icon }}
      >
        <Image
          src="/icons/android-chrome-192x192.png"
          alt="Localley"
          width={config.icon}
          height={config.icon}
          className="object-cover"
          priority
        />
      </div>
      {showText && (
        <span
          className={cn(
            config.text,
            "font-bold transition-colors hidden sm:inline-block",
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

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
