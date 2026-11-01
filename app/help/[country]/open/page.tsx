import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft, Clock } from "@/components/ui/icons";
import { ALL_CITIES } from "@/lib/cities";
import { HELP_COUNTRY_CODES } from "@/lib/help/open-nearby";
import { HELP_COUNTRIES, helpCountry } from "@/lib/help/phrases";

// Static per country like the phrase cards; one small inline script asks /api/help/open after a tap.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_COUNTRIES.map((country) => ({ country: country.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const country = helpCountry((await params).country);
  return country ? { title: `Find somewhere open nearby in ${country.name}`, description: `Places near you in ${country.name}, with one tap to their opening hours.` } : {};
}

/** Vanilla, no framework: works before hydration and keeps the route's JS tiny. Text only via textContent. */
const SCRIPT = `(()=>{const root=document.getElementById("open-nearby");if(!root)return;const country=root.dataset.country,list=document.getElementById("open-list"),status=document.getElementById("open-status");
const say=t=>{status.textContent=t};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n};
const link=(href,text,cls)=>{const a=el("a",cls,text);a.href=href;a.target="_blank";a.rel="noopener noreferrer";return a};
const km=m=>m<1000?Math.round(m/10)*10+" m":(m/1000).toFixed(1)+" km";
async function load(lat,lng,label){say("Looking near "+label+"…");list.replaceChildren();
try{const r=await fetch("/api/help/open?country="+country+"&lat="+lat.toFixed(3)+"&lng="+lng.toFixed(3));const d=await r.json();
if(r.status===429){say("Too many searches. Try again in a minute.");return}
if(d.status!=="ok"){say("Search is not available now. Try again later.");return}
if(!d.spots.length){say("No Localley spots within 2 km of "+label+". Try a city below.");return}
say(d.spots.length+" spots near "+label+". Tap \\u201cHours\\u201d to check if they are open.");
for(const s of d.spots){const li=el("li","rounded-2xl bg-surface p-4 shadow-surface");
const top=el("div","flex items-baseline justify-between gap-3");const name=el("a","font-semibold text-foreground hover:underline",s.name);name.href="/spots/"+s.id;top.append(name,el("span","shrink-0 text-sm text-muted-foreground",km(s.distanceM)));li.append(top);
if(s.localName)li.append(el("p","mt-0.5 text-sm text-muted-foreground",s.localName));
const row=el("div","mt-3 flex flex-wrap gap-2");row.append(link(s.google,"Hours in Google Maps","inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"));
if(s.naver)row.append(link(s.naver,"Naver Map","inline-flex min-h-11 items-center rounded-full bg-raised px-4 text-sm font-semibold text-foreground"));li.append(row);list.append(li)}}
catch{say("No connection. Try again when you are online.")}}
document.getElementById("open-locate").addEventListener("click",()=>{if(!navigator.geolocation){say("Your browser cannot share its location. Pick a city below.");return}
say("Asking for your location…");navigator.geolocation.getCurrentPosition(p=>load(p.coords.latitude,p.coords.longitude,"you"),()=>say("Location is off. Pick a city below."),{maximumAge:300000,timeout:15000})});
root.querySelectorAll("[data-lat]").forEach(b=>b.addEventListener("click",()=>load(Number(b.dataset.lat),Number(b.dataset.lng),b.dataset.name+" centre")))})();`;

export default async function HelpOpenPage({ params }: { params: Promise<{ country: string }> }) {
  const country = helpCountry((await params).country);
  if (!country) notFound();
  const cities = ALL_CITIES.filter((city) => city.countryCode === HELP_COUNTRY_CODES[country.slug])
    .sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled) || a.ring - b.ring);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link href={`/help/${country.slug}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {country.name} phrases
      </Link>
      <PageHeader eyebrow={`${country.flag} ${country.name}`} eyebrowIcon={Clock} title="Find somewhere open nearby"
        lede="Localley spots within 2 km. Opening hours change: check them in the map app, then ask at the door." />
      <div id="open-nearby" data-country={country.slug} className="mt-6">
        <button id="open-locate" type="button" className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 text-base font-semibold text-primary-foreground sm:w-auto">
          Use my location
        </button>
        <p className="mt-2 text-sm text-muted-foreground">We round your position to about 100 m and do not store it.</p>
        <p id="open-status" role="status" aria-live="polite" className="mt-5 text-sm text-foreground" />
        <ul id="open-list" className="mt-3 flex flex-col gap-2" />
        {cities.length > 0 && (
          <section aria-labelledby="open-cities" className="mt-8">
            <h2 id="open-cities" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Or start from a city</h2>
            <div className="flex flex-wrap gap-2">
              {cities.map((city) => (
                <button key={city.slug} type="button" data-lat={city.center.lat} data-lng={city.center.lng} data-name={city.name}
                  className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold text-foreground shadow-surface hover:bg-raised">
                  {city.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      {country.language !== "en" && (
        <p className="mt-8 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
          At the door? <Link href={`/help/${country.slug}#card-open_now`} className="font-semibold underline">Show &ldquo;Are you open now?&rdquo;</Link>
          {" "}or <Link href={`/help/${country.slug}#card-close_time`} className="font-semibold underline">&ldquo;What time do you close?&rdquo;</Link> in {country.languageName}.
        </p>
      )}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </main>
  );
}
