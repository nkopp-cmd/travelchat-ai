// Existing city photographs, resized ahead of time and served by the static CDN.
// Presets must not depend on a third-party fetch or a second optimization request.
const PRESET_PHOTOS: Record<string, string> = {
  Seoul: "/images/landing/seoul-preset-v1",
  Tokyo: "/images/landing/tokyo-preset-v1",
  Bangkok: "/images/landing/bangkok-preset-v1",
};

export function LandingPresetPhoto({ city }: { city: string }) {
  if (!Object.hasOwn(PRESET_PHOTOS, city)) return null;
  const photo = PRESET_PHOTOS[city];

  return (
    // Native responsive images select one pre-sized CDN asset without a loader.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${photo}-960.webp`}
      srcSet={`${photo}-480.webp 480w, ${photo}-960.webp 960w`}
      sizes="(max-width: 768px) 100vw, 33vw"
      width={960}
      height={320}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
    />
  );
}
