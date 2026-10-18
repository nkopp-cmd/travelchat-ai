// Pre-sized assets use the existing Cloudflare static-asset CDN. There is no
// third-party request or second image-optimization request for this decoration.
const heroSrcSet =
  "/images/landing/tokyo-hero-v1-640.webp 640w, /images/landing/tokyo-hero-v1-1280.webp 1280w, /images/landing/tokyo-hero-v1-1920.webp 1920w";

export function LandingHero() {
  return (
    <>
      <link
        rel="preload"
        as="image"
        imageSrcSet={heroSrcSet}
        imageSizes="100vw"
        fetchPriority="high"
      />
      {/* Native srcset and the identical preload select one CDN variant. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/landing/tokyo-hero-v1-1280.webp"
        srcSet={heroSrcSet}
        sizes="100vw"
        width={1920}
        height={1280}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-75"
      />
    </>
  );
}
