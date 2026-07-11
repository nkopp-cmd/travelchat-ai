"use client";

import { Images } from "lucide-react";
import { useState } from "react";

type SubmissionPreviewImageProps = {
  src: string | null;
  fallbackSrc?: string | null;
  title: string;
};

export function SubmissionPreviewImage({
  src,
  fallbackSrc = null,
  title,
}: SubmissionPreviewImageProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const activeSrc = [src, fallbackSrc]
    .filter((candidate): candidate is string => Boolean(candidate))
    .find((candidate) => !failedSources.includes(candidate)) || null;

  if (!activeSrc) {
    return (
      <div
        role="img"
        aria-label={`${title} preview unavailable`}
        className="flex h-full min-h-40 items-center justify-center bg-violet-950/60"
      >
        <Images className="h-10 w-10 text-violet-100/35" aria-hidden="true" />
      </div>
    );
  }

  return (
    <>
      {/* Social CDN URLs are signed and cannot reliably pass through Next's optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={activeSrc}
        alt={`${title} preview`}
        width={640}
        height={360}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
        onError={() => {
          setFailedSources((current) =>
            current.includes(activeSrc) ? current : [...current, activeSrc]
          );
        }}
      />
    </>
  );
}
