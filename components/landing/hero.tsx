import type { CSSProperties } from "react";
import { TONE_ICONS } from "@/components/spots/category-tone";
import { pinTone } from "@/lib/spots/pin-clusters";
import { HeroCardPlacer } from "@/components/landing/hero-card-placer";
import { spotPhotoPinPath } from "@/lib/spots/own-photo";

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
    /** Our own stored photo of the real place (spot_photos, /media/spot); the pin loads its 144 px copy. */
    photo: string;
    m: [number, number];
    d: [number, number];
}

export const HERO_PINS: HeroPin[] = [
    { id: "a855020b-e87e-4b9c-8477-cfe37b546e11", name: "Sindang-dong Tteokbokki Town", category: "Food", area: "Jung-gu", photo: "/media/spot/a855020b-e87e-4b9c-8477-cfe37b546e11/4a1b10860443b383fb15a99f8749057396a3ecb600364fe3e04257d241cd7906.webp", m: [67.42, 52.73], d: [75.59, 36.15] },
    { id: "0d120515-c856-48cf-8621-7efad0e59568", name: "Namdaemun Market Night Shopping", category: "Market", area: "Jung-gu", photo: "/media/spot/0d120515-c856-48cf-8621-7efad0e59568/8344c77eee82a6b933b39c70075c9bb9ca0f6784f27f6cdd95317d396ebdf64d.webp", m: [43.82, 55.73], d: [61.68, 41.73] },
    { id: "11107241-dfb3-4cfc-a0c5-d243630f07b8", name: "Cheonggyecheon Stream Night Walk", category: "Outdoor", area: "Jung-gu", photo: "/media/spot/11107241-dfb3-4cfc-a0c5-d243630f07b8/7f7eadd844dc6713090c6757a5d45e2b2a3d0fb0ea37d18a471ab323d192653c.webp", m: [88.61, 48.77], d: [88.07, 28.78] },
    { id: "c4fb47be-d4d8-45ee-b8a3-c49ccdb12cad", name: "Gyeonghuigung Palace", category: "Culture", area: "Jongno", photo: "/media/spot/c4fb47be-d4d8-45ee-b8a3-c49ccdb12cad/9fc235bfdca770fc91fe1426d15d448ea1c33ba4bfeda09b825c085ed5899d61.webp", m: [36.93, 49.34], d: [57.63, 29.84] },
    { id: "ecf11071-055b-4ec4-aa87-78281e494ca2", name: "Hyochang Park", category: "Culture", area: "Yongsan", photo: "/media/spot/ecf11071-055b-4ec4-aa87-78281e494ca2/5fed6713cc9b007496a85ddd40fc9a181793c0f445bd1720f9cb76bf883acd16.webp", m: [31.75, 66.43], d: [54.58, 61.65] },
    { id: "221d7ff2-b199-469f-81f5-d7e965ebf182", name: "Ikseon-dong Hanok Village", category: "Nightlife", area: "Jongno", photo: "/media/spot/221d7ff2-b199-469f-81f5-d7e965ebf182/93937bc5408ceafe2440148f25d5f99fcfe59a81244d3dd36773e579c01a7ebd.webp", m: [53.17, 47.67], d: [67.19, 26.74] },
    { id: "a6f27a12-f460-4cc3-936e-9c4d0808e8c2", name: "Nodeulseom Island", category: "Culture", area: "Yongsan", photo: "/media/spot/a6f27a12-f460-4cc3-936e-9c4d0808e8c2/8bde1950d0f4ac334c557600c4d779e6ad9559aa9041aba9f17e1575b82fd9b3.webp", m: [29.72, 78.03], d: [53.38, 83.26] },
    { id: "c704c853-04a8-432b-879b-446968cc7ca0", name: "Jamwon Hangang Park", category: "Outdoor", area: "Seocho", photo: "/media/spot/c704c853-04a8-432b-879b-446968cc7ca0/b6931821f4094ef0f738abba84a08d38a8a0c8d9aa68d51c6a5ff3f43571d78c.webp", m: [73.0, 74.02], d: [78.87, 75.79] },
    { id: "b50160e9-3c20-49c6-8d8f-7700b0b8ccc3", name: "Naksan Park Sunset", category: "Outdoor", area: "Jongno", photo: "/media/spot/b50160e9-3c20-49c6-8d8f-7700b0b8ccc3/383f48bb6b0d06fb3998945bdb022a6dd43d5bbb56a7745417b75943639c0f80.webp", m: [66.66, 44.38], d: [75.14, 20.61] },
];
/** The pin whose card opens on a loop. */
export const HERO_FEATURED_ID = HERO_PINS[0].id;
// On phones a pin near the side would be cut by the crop, one above 48 % touches the subtitle,
// and one below 70 % sits under the chips.
const MOBILE_SAFE_X: [number, number] = [6, 94];
const MOBILE_MIN_Y = 48;
const MOBILE_MAX_Y = 70;

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
    const Icon = TONE_ICONS[pinTone(pin.category)];
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
                    {/* Our own photo of the place, 144 px immutable copy from R2: no Places call per visitor. A CSS
                        background, not an <img>: a failed photo draws nothing, so the category tile below shows
                        clean instead of a broken-image mark (2026-11-04 390 px shot). */}
                    <span className="ll-hero-pin-photo" style={{ "--ll-pin-photo": `url(${spotPhotoPinPath(pin.photo)})` } as CSSProperties} />
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
