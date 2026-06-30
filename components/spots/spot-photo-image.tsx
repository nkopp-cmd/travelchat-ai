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
}

export function SpotPhotoImage({
    src,
    fallbackSrc,
    alt,
    className,
    sizes,
    quality = 90,
    priority = false,
}: SpotPhotoImageProps) {
    const [imageSrc, setImageSrc] = useState(src);
    const [didFallback, setDidFallback] = useState(false);

    return (
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
    );
}
