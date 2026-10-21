"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Coffee,
  Compass,
  MapPin,
  Search,
  Sparkles,
  Utensils,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { CityImageAvatar } from "@/components/ui/city-image";
import { LandingPresetPhoto } from "@/components/landing/preset-photo";
import { cn } from "@/lib/utils";

type CityOption = { name: string; slug: string; vibe?: string };
const VIBE_OPTIONS = [
  { id: "Food & Dining", label: "Food", icon: Utensils },
  { id: "Cafes & Coffee", label: "Cafes", icon: Coffee },
  { id: "Art & Culture", label: "Culture", icon: Compass },
  { id: "Street Food", label: "Street food", icon: Sparkles },
];

const QUICK_PRESETS = [
  {
    title: "One night in Seoul",
    detail: "Food street, tiny bar, late cafe. No palace marathon.",
    city: "Seoul",
    days: 1,
    interests: ["Food & Dining", "Nightlife & Bars"],
  },
  {
    title: "Tokyo cafe weekend",
    detail: "Quiet neighborhoods, coffee, small shops, walkable stops.",
    city: "Tokyo",
    days: 2,
    interests: ["Cafes & Coffee", "Art & Culture"],
  },
  {
    title: "Bangkok street-food run",
    detail: "Markets, local dinner, easy late route, fewer generic lists.",
    city: "Bangkok",
    days: 3,
    interests: ["Street Food", "Food & Dining"],
  },
];

function citySlug(cityName: string) {
  return cityName.toLowerCase().replace(/\s+/g, "-");
}

function encodedInterests(interests: string[]) {
  return interests.join(",");
}

const PlannerContext = createContext<ReturnType<typeof usePlannerState> | null>(
  null,
);
function usePlannerState(cities: CityOption[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("Seoul");
  const [days, setDays] = useState(3);
  const [interests, setInterests] = useState<string[]>([
    "Food & Dining",
    "Cafes & Coffee",
  ]);
  const router = useRouter();

  const selectedCityMeta =
    cities.find((city) => city.name === selectedCity) ?? cities[0];

  const itineraryHref = useMemo(() => {
    const params = new URLSearchParams({
      city: selectedCity,
      days: String(days),
      interests: encodedInterests(interests),
      pace: days <= 2 ? "active" : "moderate",
      budget: "moderate",
      localness: "4",
    });
    return `/itineraries/new?${params.toString()}`;
  }, [days, interests, selectedCity]);

  const exploreHref = useMemo(() => {
    const params = new URLSearchParams({
      city: citySlug(selectedCity),
      sort: "local",
    });
    if (interests[0]) {
      const category = interests[0].split(" ")[0];
      params.set("category", category);
    }
    return `/spots?${params.toString()}`;
  }, [interests, selectedCity]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      router.push(`/spots?search=${encodeURIComponent(query)}`);
      return;
    }
    router.push(exploreHref);
  };

  const toggleInterest = (interest: string) => {
    setInterests((current) => {
      if (current.includes(interest)) {
        const next = current.filter((item) => item !== interest);
        return next.length ? next : current;
      }
      return [...current, interest].slice(0, 3);
    });
  };

  const applyPreset = (preset: (typeof QUICK_PRESETS)[number]) => {
    setSelectedCity(preset.city);
    setDays(preset.days);
    setInterests(preset.interests);
  };

  return {
    cities,
    searchQuery,
    setSearchQuery,
    selectedCity,
    selectedCityMeta,
    days,
    interests,
    itineraryHref,
    exploreHref,
    setSelectedCity,
    setDays,
    toggleInterest,
    handleSearch,
    applyPreset,
  };
}
function usePlanner() {
  const planner = useContext(PlannerContext);
  if (!planner) throw new Error("Landing controls need their planner");
  return planner;
}
export function LandingPlanner({
  cities,
  children,
}: {
  cities: CityOption[];
  children: ReactNode;
}) {
  const planner = usePlannerState(cities);
  return (
    <PlannerContext.Provider value={planner}>
      {children}
    </PlannerContext.Provider>
  );
}
export function LandingExploreLink(
  props: Omit<ComponentProps<typeof Link>, "href">,
) {
  const { exploreHref } = usePlanner();
  return (
    <Link {...props} prefetch={false} href={exploreHref}>
      {props.children ?? "Browse local spots"}
    </Link>
  );
}
export function LandingSearch() {
  const { handleSearch, searchQuery, setSearchQuery } = usePlanner();
  return (
    <form
      onSubmit={handleSearch}
      className="mt-8 flex max-w-2xl flex-col gap-2 rounded-lg bg-black/35 p-2 backdrop-blur-md sm:flex-row"
    >
      <label className="sr-only" htmlFor="landing-search">
        Search for a city, food, cafe, or neighborhood
      </label>
      <div className="flex min-h-12 flex-1 items-center gap-3 px-3">
        <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <input
          id="landing-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search Seoul cafes, Bangkok food, Tokyo vintage..."
          className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-12 rounded-lg"
      >
        Search
      </Button>
    </form>
  );
}
export function LandingTripBuilder() {
  const {
    cities,
    selectedCity,
    selectedCityMeta,
    days,
    interests,
    itineraryHref,
    exploreHref,
    setSelectedCity,
    setDays,
    toggleInterest,
  } = usePlanner();
  return (
    <TripBuilder
      cities={cities}
      selectedCity={selectedCity}
      selectedCityMeta={selectedCityMeta}
      days={days}
      interests={interests}
      itineraryHref={itineraryHref}
      exploreHref={exploreHref}
      setSelectedCity={setSelectedCity}
      setDays={setDays}
      toggleInterest={toggleInterest}
    />
  );
}
export function LandingPresets() {
  const { applyPreset } = usePlanner();
  return (
    <section className="bg-surface py-8">
      <div className="container mx-auto grid max-w-7xl gap-3 px-4 md:grid-cols-3 md:px-6">
        {QUICK_PRESETS.map((preset) => (
          <button
            key={preset.title}
            type="button"
            onClick={() => applyPreset(preset)}
            className="group overflow-hidden rounded-lg bg-raised text-left transition hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative h-24 overflow-hidden">
              <LandingPresetPhoto city={preset.city} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <span className="absolute bottom-3 left-4 rounded-md bg-black/45 px-2 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
                {preset.city}
              </span>
            </div>
            <div className="p-5">
              <h2 className="mb-3 text-lg font-bold text-foreground">
                {preset.title}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {preset.detail}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
function TripBuilder({
  cities,
  selectedCity,
  selectedCityMeta,
  days,
  interests,
  itineraryHref,
  exploreHref,
  setSelectedCity,
  setDays,
  toggleInterest,
}: {
  cities: CityOption[];
  selectedCity: string;
  selectedCityMeta: CityOption | undefined;
  days: number;
  interests: string[];
  itineraryHref: string;
  exploreHref: string;
  setSelectedCity: (city: string) => void;
  setDays: (days: number) => void;
  toggleInterest: (interest: string) => void;
}) {
  return (
    <div className="rounded-lg bg-surface p-4 backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Build a route</p>
          <h2 className="mt-1 text-2xl font-black text-foreground">
            Where are you going?
          </h2>
        </div>
        <div className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-foreground">
          60 sec setup
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            City
          </div>
          <div className="grid grid-cols-2 gap-2">
            {cities.slice(0, 6).map((city) => {
              const isSelected = city.name === selectedCity;
              return (
                <button
                  key={city.slug}
                  type="button"
                  onClick={() => setSelectedCity(city.name)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-lg px-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? " bg-primary/15 text-foreground"
                      : " bg-raised text-muted-foreground hover:bg-raised",
                  )}
                >
                  <CityImageAvatar
                    city={city.name}
                    className="h-9 w-9"
                    sizes="36px"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {city.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {city.vibe}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-primary" />
            Days
          </div>
          <div
            className="grid grid-cols-4 gap-2"
            role="group"
            aria-label="Trip duration"
          >
            {[1, 2, 3, 5].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                aria-pressed={days === option}
                className={cn(
                  "min-h-11 rounded-lg text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  days === option
                    ? " bg-primary/15 text-foreground"
                    : " bg-raised text-muted-foreground ",
                )}
              >
                {option}d
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Vibe
          </div>
          <div className="grid grid-cols-2 gap-2">
            {VIBE_OPTIONS.map((vibe) => {
              const Icon = vibe.icon;
              const isSelected = interests.includes(vibe.id);
              return (
                <button
                  key={vibe.id}
                  type="button"
                  onClick={() => toggleInterest(vibe.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-12 items-center justify-between rounded-lg px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? " bg-primary/15 text-foreground"
                      : " bg-raised text-muted-foreground ",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {vibe.label}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-foreground" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg bg-raised p-3">
          <div className="flex items-center gap-3">
            <CityImageAvatar
              city={selectedCityMeta?.name ?? selectedCity}
              className="h-12 w-12 rounded-lg"
              sizes="48px"
            />
            <div className="min-w-0">
              <p className="font-bold text-foreground">
                {selectedCityMeta?.name ?? selectedCity}, {days}{" "}
                {days === 1 ? "day" : "days"}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {interests.join(", ")} with a local-first route and fewer
                obvious tourist stops.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-lg bg-primary font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Link prefetch={false} href={itineraryHref}>
              Start planning
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-lg bg-raised text-foreground hover:bg-overlay"
          >
            <Link prefetch={false} href={exploreHref}>
              Browse spots
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
