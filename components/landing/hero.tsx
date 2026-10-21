// Pre-sized assets use the existing Cloudflare static-asset CDN. There is no
// third-party request or second image-optimization request for this decoration.
const heroSrcSet =
  "/images/landing/tokyo-hero-v1-640.webp 640w, /images/landing/tokyo-hero-v1-1280.webp 1280w, /images/landing/tokyo-hero-v1-1920.webp 1920w";
// AVIF q40 is about a quarter of the WebP bytes (828w: 47 KB vs 1280w WebP: 199 KB); it is the LCP image.
const heroAvifSrcSet =
  "/images/landing/tokyo-hero-v1-828.avif 828w, /images/landing/tokyo-hero-v1-1280.avif 1280w, /images/landing/tokyo-hero-v1-1920.avif 1920w";

export function LandingHero() {
  return (
    <>
      <link
        rel="preload"
        as="image"
        imageSrcSet={heroAvifSrcSet}
        imageSizes="100vw"
        type="image/avif"
        fetchPriority="high"
      />
      {/* The AVIF source and the identical preload select one CDN variant; WebP is the fallback. */}
      <picture>
        <source type="image/avif" srcSet={heroAvifSrcSet} sizes="100vw" />
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
      </picture>
    </>
  );
}
