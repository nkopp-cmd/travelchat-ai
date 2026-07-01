"use client";

import Image from "next/image";
import { useState } from "react";

interface SpotPhotoImageProps {
    src: string;
    fallbackSrc: string;
    alt: string;
    className?: string;
    sizes: string;
    quality?: number;
    priority?: boolean;
    fallbackBadgeLabel?: string;
    fallbackBadgeClassName?: string;
    showFallbackBadgeInitially?: boolean;
}

export function SpotPhotoImage({
    src,
    fallbackSrc,
    alt,
    className,
    sizes,
    quality = 90,
    priority = false,
    fallbackBadgeLabel,
    fallbackBadgeClassName,
    showFallbackBadgeInitially = false,
}: SpotPhotoImageProps) {
    const [imageSrc, setImageSrc] = useState(src);
    const [didFallback, setDidFallback] = useState(showFallbackBadgeInitially);
    const isShowingFallback = Boolean(fallbackBadgeLabel) && (didFallback || imageSrc === fallbackSrc);

    return (
        <>
            <Image
                src={imageSrc}
                alt={alt}
                fill
                className={className}
                priority={priority}
                quality={quality}
                sizes={sizes}
                onError={() => {
                    if (!didFallback && imageSrc !== fallbackSrc) {
                        setImageSrc(fallbackSrc);
                        setDidFallback(true);
                    }
                }}
            />
            {isShowingFallback && (
                <span
                    className={
                        fallbackBadgeClassName ||
                        "absolute bottom-2 left-2 z-10 rounded-full border border-amber-200/30 bg-black/60 px-2 py-1 text-[11px] font-semibold text-amber-100 shadow-lg shadow-black/15 backdrop-blur"
                    }
                >
                    {fallbackBadgeLabel}
                </span>
            )}
        </>
    );
}
