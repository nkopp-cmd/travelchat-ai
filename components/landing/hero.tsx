import type { ComponentType, CSSProperties } from "react";
import { Camera, Moon, Store, Utensils, type IconProps } from "@/components/ui/icons";
import { pinTone } from "@/lib/spots/pin-clusters";
import { HeroCardPlacer } from "@/components/landing/hero-card-placer";
import { cardGooglePhotoUrl } from "@/lib/spots/own-photo";

// The landing hero is a poster of the Localley map (shared/plans/localley-landing-map-weather.md
// step 2): Seoul rendered offline in the Localley MapLibre style, with real catalog spots as
// pins at their projected positions. Pins and the looping card are CSS only; the interactive
// map is one tap away on /spots. No map library; one small client effect (HeroCardPlacer) moves the card to a side
// where it covers no pin and no copy.
//
// Posters: claude-work/tmp/poster render (MapLibre 5.24, lib/maps/localley-map-style.ts);
// mobile 414x736 @2x centre 126.9855,37.570 z11.1; desktop 1920x1080 centre 126.951,37.551 z12.55.
const DESKTOP_AVIF = "/images/landing/seoul-map-v1-d-1280.avif 1280w, /images/landing/seoul-map-v1-d-1920.avif 1920w";
const DESKTOP_WEBP = "/images/landing/seoul-map-v1-d-1280.webp 1280w, /images/landing/seoul-map-v1-d-1920.webp 1920w";
const MOBILE_AVIF = "/images/landing/seoul-map-v1-m-828.avif 828w";
const MOBILE_WEBP = "/images/landing/seoul-map-v1-m-828.webp 828w";
const MOBILE_MEDIA = "(max-width: 767px)";
const DESKTOP_MEDIA = "(min-width: 768px)";

/** A catalog spot on the poster; positions are % of the mobile (m) and desktop (d) poster. */
export interface HeroPin {
    id: string;
    name: string;
    category: string;
    area: string;
    /** Google place id (D1 spots.photos name); the pin shows its current first photo. */
    placeId: string;
    m: [number, number];
    d: [number, number];
}

export const HERO_PINS: HeroPin[] = [
    { id: "15614d97-380f-4e8d-8aa6-aa6f43609bcf", name: "Euljiro Nogari Alley", category: "Nightlife", area: "Euljiro", placeId: "ChIJA17wJIajfDURORb_dfN8bkU", m: [60.93, 51.71], d: [71.77, 34.26] },
    { id: "f6b6d93a-4993-4ce7-8691-afe8b2ce3d09", name: "Dongmyo Flea Market", category: "Market", area: "Jongno", placeId: "ChIJE_OSzJKjfDURqPqIzTBFnuI", m: [72.09, 49.14], d: [78.34, 29.48] },
    { id: "809aca12-dea3-4020-806a-e5883699c5e0", name: "Namyeong-dong Craft Village", category: "Culture", area: "Yongsan", placeId: "ChIJP6v5WGqifDURqzEHpjw0aSA", m: [38.16, 58.88], d: [58.35, 47.61] },
    { id: "067bacc4-825e-4e60-bab8-2720785c15bf", name: "Haengdang-dong Local Market", category: "Market", area: "Seongdong", placeId: "ChIJ09QwdWijfDURcBudzP3kNGE", m: [87.85, 56.53], d: [87.62, 43.23] },
    { id: "4e3c557d-6d10-4981-8796-dd44346df183", name: "Miir Lounge", category: "Nightlife", area: "Itaewon", placeId: "ChIJHxW2nH-jfDURKibKs9z1aOk", m: [55.88, 71.95], d: [68.79, 71.95] },
    { id: "8b77ad00-78db-4350-a2ff-83baff2fb7c9", name: "Sungin-dong Hills", category: "Culture", area: "Jongno", placeId: "ChIJm6x0HTujfDURbf9iX8DtJ2A", m: [74.88, 46.52], d: [79.98, 24.6] },
    { id: "90992f56-9ff0-4c6a-a5fc-5c67730ba12d", name: "Yonggang-dong Local Eats", category: "Food", area: "Mapo", placeId: "ChIJDwy2KrCYfDURK4ghAucLbSY", m: [17.65, 65.19], d: [46.27, 59.36] },
    { id: "30d2b679-8a12-4344-9273-a941195fd912", name: "Noryangjin Fish Market", category: "Food", area: "Dongjak", placeId: "ChIJOTEaKmiffDURNTst1Jzcm_c", m: [17.12, 81.23], d: [45.96, 89.22] },
    { id: "48d93835-ca17-49d3-8308-0f59871e4618", name: "Ahyeon-dong Traditional Market", category: "Market", area: "Mapo", placeId: "ChIJURi8bYujfDURu6Nv8QWhdcc", m: [25.12, 60.38], d: [50.67, 50.4] },
];
/** The pin whose card opens on a loop. */
export const HERO_FEATURED_ID = HERO_PINS[0].id;
// On phones a pin near the side would be cut by the crop, one above 48 % touches the subtitle,
// and one below 70 % sits under the chips.
const MOBILE_SAFE_X: [number, number] = [6, 94];
const MOBILE_MIN_Y = 48;
const MOBILE_MAX_Y = 70;

const PIN_ICONS: Record<string, ComponentType<IconProps>> = { Food: Utensils, Market: Store, Nightlife: Moon, Culture: Camera };

export function LandingHero() {
    return (
        <>
            <link rel="preload" as="image" imageSrcSet={MOBILE_AVIF} imageSizes="100vw" type="image/avif" media={MOBILE_MEDIA} fetchPriority="high" />
            <link rel="preload" as="image" imageSrcSet={DESKTOP_AVIF} imageSizes="100vw" type="image/avif" media={DESKTOP_MEDIA} fetchPriority="high" />
            <div className="ll-hero-scene" aria-hidden="true">
                <div className="ll-hero-stage ll-pin-map" data-zoom-band="near">
                    <picture>
                        <source type="image/avif" media={MOBILE_MEDIA} srcSet={MOBILE_AVIF} sizes="100vw" />
                        <source type="image/webp" media={MOBILE_MEDIA} srcSet={MOBILE_WEBP} sizes="100vw" />
                        <source type="image/avif" srcSet={DESKTOP_AVIF} sizes="100vw" />
                        {/* Pre-sized CDN poster, the LCP image; inside <picture> the img rule does not apply. */}
                        <img src="/images/landing/seoul-map-v1-d-1280.webp" srcSet={DESKTOP_WEBP} sizes="100vw" width={1920} height={1080}
                            alt="" fetchPriority="high" decoding="async" className="ll-hero-poster" />
                    </picture>
                    {HERO_PINS.map((pin, index) => <HeroPinMark key={pin.id} pin={pin} index={index} />)}
                </div>
            </div>
            <HeroCardPlacer />
        </>
    );
}

function HeroPinMark({ pin, index }: { pin: HeroPin; index: number }) {
    const Icon = PIN_ICONS[pin.category] ?? Store;
    const featured = pin.id === HERO_FEATURED_ID;
    const mobile = pin.m[0] >= MOBILE_SAFE_X[0] && pin.m[0] <= MOBILE_SAFE_X[1] && pin.m[1] >= MOBILE_MIN_Y && pin.m[1] <= MOBILE_MAX_Y;
    const style = {
        "--mx": `${pin.m[0]}%`, "--my": `${pin.m[1]}%`, "--dx": `${pin.d[0]}%`, "--dy": `${pin.d[1]}%`,
        "--delay": `${260 + index * 90}ms`,
    } as CSSProperties;
    return (
        <span className="ll-hero-pin" style={style} data-mobile={mobile ? undefined : "hidden"} data-featured={featured || undefined}>
            <span className="ll-pin" data-tone={pinTone(pin.category)}>
                <span className="ll-pin-face">
                    <Icon className="h-[18px] w-[18px]" />
                    {/* Same small proxy URL as the cards (private browser cache, bots get no Places call). The icon
                        stays under the photo, so a failed or capped photo shows the category tile. */}
                    {/* eslint-disable-next-line @next/next/no-img-element -- 30 px pin thumbnail, lazy, never the LCP. */}
                    <img className="ll-hero-pin-photo" src={cardGooglePhotoUrl(`places/${pin.placeId}/photos/current`)} alt=""
                        loading="lazy" decoding="async" fetchPriority="low" width={30} height={30} />
                </span>
            </span>
            {featured && (
                <span className="ll-hero-card" data-tone={pinTone(pin.category)}>
                    <span className="ll-hero-card-title">{pin.name}</span>
                    <span className="ll-hero-card-meta">{pin.area} · {pin.category} · {"Locals' pick"}</span>
                </span>
            )}
        </span>
    );
}
