import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft, Utensils } from "@/components/ui/icons";
import { HELP_COUNTRIES, helpCountry, helpPhrases } from "@/lib/help/phrases";

// Static per country like the phrase cards; one small inline script sends the photo to /api/help/menu.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_COUNTRIES.map((country) => ({ country: country.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const country = helpCountry((await params).country);
  return country ? { title: `Help me order this in ${country.name}`, description: `Photograph a menu in ${country.name} and read every dish in English.` } : {};
}

/**
 * Vanilla, no framework: works before hydration and keeps the route's JS tiny. Text only via textContent.
 * It writes only to nodes the server renders empty, and only after a user action, so hydration sees the server HTML.
 * The photo is shrunk in the browser (<= 1600 px JPEG) so the upload stays small on a travel data plan.
 */
const SCRIPT = `(()=>{const root=document.getElementById("menu-help");if(!root)return;const input=document.getElementById("menu-file"),list=document.getElementById("menu-list"),status=document.getElementById("menu-status"),notes=document.getElementById("menu-notes"),card=document.getElementById("menu-card");
const lang=root.dataset.lang;
const TAGS={pork:"Pork",beef:"Beef",chicken:"Chicken",lamb:"Lamb",fish:"Fish",shellfish:"Shellfish",egg:"Egg",dairy:"Dairy",peanut:"Peanut",tree_nut:"Tree nuts",wheat:"Wheat",soy:"Soy",sesame:"Sesame",alcohol:"Alcohol",spicy:"Spicy",vegetarian:"Vegetarian"};
const say=t=>{status.textContent=t};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n};
function shrink(file){return new Promise((ok,fail)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const s=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
let q=0.85,d=c.toDataURL("image/jpeg",q);while(d.length>1900000&&q>0.4){q-=0.15;d=c.toDataURL("image/jpeg",q)}ok(d.slice(d.indexOf(",")+1))};img.onerror=()=>{URL.revokeObjectURL(url);fail()};img.src=url})}
function show(dish){card.querySelector("[data-original]").textContent=dish.original;card.querySelector("[data-english]").textContent=dish.english;card.hidden=false;card.querySelector("button").focus()}
card.querySelector("button").addEventListener("click",()=>{card.hidden=true});
input.addEventListener("change",async()=>{const file=input.files&&input.files[0];if(!file)return;list.replaceChildren();notes.replaceChildren();say("Reading the menu… this takes about 5 seconds.");
let image;try{image=await shrink(file)}catch{say("This photo cannot be opened. Take a new photo.");return}
try{const r=await fetch("/api/help/menu",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({image})});const d=await r.json();
if(d.status==="signin"){say("");document.getElementById("menu-signin").hidden=false;return}
if(d.status==="limit"){say("You used today\\u2019s menu scans. Try again tomorrow.");return}
if(d.status==="busy"){say("Too many scans. Try again in a minute.");return}
if(d.status==="bad_image"){say("Use a JPEG or PNG photo under 1.5 MB.");return}
if(d.status==="unreadable"){say("No dishes found. Take a closer, sharper photo of the menu.");return}
if(d.status!=="ok"){say("Menu reading is not available now. Try again later.");return}
say(d.result.dishes.length+" items. Tap one to show it to the staff. "+d.remaining+" scans left today.");
for(const n of d.result.notes){notes.append(el("li","",n))}
for(const dish of d.result.dishes){const li=el("li"),b=el("button","block w-full rounded-2xl bg-surface p-4 text-left shadow-surface hover:bg-raised");b.type="button";
const top=el("span","flex items-baseline justify-between gap-3"),en=el("span","font-semibold text-foreground",dish.english);top.append(en);if(dish.price)top.append(el("span","shrink-0 text-sm text-muted-foreground",dish.price));b.append(top);
const o=el("span","mt-0.5 block text-sm text-muted-foreground",dish.original);o.lang=d.result.language||lang;b.append(o);
if(dish.description)b.append(el("span","mt-2 block text-sm text-foreground",dish.description));
if(dish.tags.length){const t=el("span","mt-2 flex flex-wrap gap-1");for(const tag of dish.tags)t.append(el("span","rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-foreground",TAGS[tag]||tag));b.append(t)}
b.addEventListener("click",()=>show(dish));li.append(b);list.append(li)}}
catch{say("No connection. Try again when you are online.")}finally{input.value=""}})})();`;

export default async function HelpMenuPage({ params }: { params: Promise<{ country: string }> }) {
  const country = helpCountry((await params).country);
  if (!country) notFound();
  const order = helpPhrases(country).flatMap((group) => group.phrases).find((phrase) => phrase.id === "order_this");
  const wrap = country.language === "ko" ? "[word-break:keep-all]" : "";
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link href={`/help/${country.slug}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {country.name} phrases
      </Link>
      <PageHeader eyebrow={`${country.flag} ${country.name}`} eyebrowIcon={Utensils} title="Help me order this"
        lede="Take a photo of the menu. Read every dish in English, then show your choice to the staff." />
      <div id="menu-help" data-lang={country.language} className="mt-6">
        <label className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-primary px-5 text-base font-semibold text-primary-foreground sm:w-auto">
          Take a menu photo
          <input id="menu-file" type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" className="sr-only" />
        </label>
        <p className="mt-2 text-sm text-muted-foreground">Free with a Localley account, 10 menus a day. We do not keep your photo.</p>
        <p id="menu-signin" hidden className="mt-5 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
          <Link href={`/sign-in?redirect_url=/help/${country.slug}/menu`} className="font-semibold underline">Sign in</Link> to read menus. It is free.
        </p>
        <p id="menu-status" role="status" aria-live="polite" className="mt-5 text-sm text-foreground" />
        <ul id="menu-notes" className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground" />
        <ul id="menu-list" className="mt-3 flex flex-col gap-2" />
      </div>
      <p className="mt-8 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
        Allergy tags are a guess from the dish name, not a promise. Always ask the staff
        {country.language !== "en" && (
          <>: show <Link href={`/help/${country.slug}#card-allergy_nuts`} className="font-semibold underline">the nut allergy card</Link>
            {" "}or <Link href={`/help/${country.slug}#card-allergy_seafood`} className="font-semibold underline">the seafood allergy card</Link></>
        )}.
      </p>
      {/* Show-to-staff card, filled by the script with the dish the traveller tapped. */}
      <div id="menu-card" hidden role="dialog" aria-label="Show this to the staff" className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-foreground p-6 text-background [&[hidden]]:hidden">
        <button type="button" className="ml-auto inline-flex min-h-11 items-center rounded-full bg-background px-5 text-base font-semibold text-foreground">Close</button>
        <div className="flex flex-1 flex-col justify-center gap-6">
          <p data-original lang={country.language} className={`text-[clamp(2.5rem,10vw,5rem)] font-bold leading-tight ${wrap}`} />
          <p lang={country.language} className={`text-[clamp(1.5rem,6vw,2.5rem)] font-semibold ${wrap}`}>{order?.text}</p>
          <p className="text-lg text-background/60"><span data-english /> &middot; {order?.en}</p>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </main>
  );
}
