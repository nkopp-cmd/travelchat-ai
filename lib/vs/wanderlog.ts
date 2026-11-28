import { PRO_TRIAL_DAYS, TIER_CONFIGS } from "@/lib/subscription";

/**
 * Push DR3: /vs/wanderlog comparison page content. Wanderlog facts were checked on 2026-11-27 against the U.S. App
 * Store listing and Wanderlog's own pricing and help pages (private research: claude-work/seo/localley/competitors).
 * Localley prices come from TIER_CONFIGS so the page can never show a stale price.
 */

export const VS_WANDERLOG_CHECKED = "2026-11-27";

const pro = TIER_CONFIGS.pro;
const free = TIER_CONFIGS.free;

const APP_STORE = "https://apps.apple.com/us/app/wanderlog-travel-planner/id1476732439";
const WL_PRO = "https://wanderlog.com/pro";
const WL_FREE_HELP = "https://help.wanderlog.com/hc/en-us/articles/13302997563547-Is-Wanderlog-free";
const WL_PRINT_HELP = "https://help.wanderlog.com/hc/en-us/articles/5154920823451-Print-your-trip";
const WL_OFFLINE_HELP = "https://help.wanderlog.com/hc/en-us/articles/13545182856859-Download-trip-plan-for-offline-access";
const WL_IMPORT_HELP = "https://help.wanderlog.com/hc/en-us/articles/4625693334811-Add-flight-hotel-and-rental-car-details-by-forwarding-an-email";

export const VS_WANDERLOG = {
    path: "/vs/wanderlog",
    title: "Localley vs Wanderlog: done-for-you plans or DIY maps",
    description:
        "Localley vs Wanderlog: Wanderlog suits groups that build trips by hand. Localley writes each day for you from local spots: Seoul, Tokyo, Bangkok and Singapore.",
    h1: "Localley vs Wanderlog: a plan written for you, or a map you fill yourself",
    verdict: [
        "Pick Wanderlog when you plan with friends, keep bookings in one place or need the plan offline. Its free plan has live group editing.",
        "Pick Localley for a finished day-by-day plan in Seoul, Tokyo, Bangkok or Singapore, built from spots locals rate.",
    ],
    reasons: [
        {
            reason: "Who builds the days",
            them: "You add each stop on a map. Wanderlog shows travel times and distances between stops.",
            us: "You pick a city, days, interests and pace. Localley writes every day, morning to night.",
            source: APP_STORE,
        },
        {
            reason: "Where the spots come from",
            them: "Place recommendations and guides; its AI ranks suggestions with Google and Tripadvisor reviews.",
            us: "Spots that locals rate: markets, cafes, food streets and neighborhoods, not only the top-10 list.",
            source: "https://wanderlog.com/trip-planner-ai",
        },
        {
            reason: "Planning with friends",
            them: "Free: invite tripmates, edit together in real time, split costs.",
            us: "Share a read-only link of your plan with tripmates. There is no live group editing.",
            source: WL_FREE_HELP,
        },
        {
            reason: "Getting to the door",
            them: "Opens directions to the next stop in Google or Apple Maps.",
            us: "Pro shows the full address of every stop; spot cards show it in the local script for a taxi driver.",
            source: APP_STORE,
        },
        {
            reason: "Paid plan for one trip",
            them: "Pro from $16.99 a month on the website.",
            us: `Pro is $${pro.price} a month after ${PRO_TRIAL_DAYS} days free for new subscribers; cancel any time.`,
            source: WL_PRO,
        },
    ],
    priceRows: [
        { window: "Plan one trip (1 month of Pro)", them: 16.99, us: pro.price },
        { window: "Two trips, two months apart (2 months)", them: 33.98, us: pro.price * 2 },
        { window: "Travel all year (annual Pro)", them: 39.99, us: pro.yearlyPrice },
    ],
    priceNote:
        "Wanderlog prices are the website's \"starting at\" prices. The U.S. App Store lists the annual plan at $31.99 to $59.99 and the monthly plan at $5.99 or $16.99. Check Wanderlog's pricing page for the price you get.",
    switchSteps: [
        "In Wanderlog, open the trip on the website, choose \"Print this trip\" in the three-dot menu and save it as a PDF. Keep it for your booking numbers.",
        "Open the Localley planner. Pick the same city and the number of days.",
        "Choose the interests and the pace that match your Wanderlog list (food, markets, nightlife, relaxed or packed).",
        "Read the plan and compare it with your PDF. Swap a stop when you already booked a fixed time.",
    ],
    switchTime: "About 10 minutes for a 3-day trip. Localley has no Wanderlog import, so the PDF is your checklist.",
    themBetter: [
        { title: "Group trips", text: "Free real-time editing for every tripmate, plus budgets and split costs. Localley shares a read-only plan only.", source: WL_FREE_HELP },
        { title: "Bookings in one place", text: "Forward flight, hotel and car emails to your trip. Localley does not import bookings.", source: WL_IMPORT_HELP },
        { title: "No signal abroad", text: "Wanderlog Pro saves the trip, notes and files for offline use on iOS and Android.", source: WL_OFFLINE_HELP },
        { title: "Any city, many stops", text: "Plan any destination with unlimited stops on the free plan. Localley plans four cities in Asia today.", source: APP_STORE },
        { title: "A year of travel for less", text: `Annual Pro from $39.99 against Localley Pro at $${pro.yearlyPrice} a year.`, source: WL_PRO },
    ],
    faq: [
        {
            question: "Is Localley free like Wanderlog?",
            answer: `Your first trip plan is free and needs no account. A free account plans ${free.limits.itinerariesPerMonth} trip a month and saves ${free.limits.savedSpotsLimit} spots. Wanderlog's free plan has unlimited trips and stops, but you build each day yourself.`,
        },
        {
            question: "Is Localley cheaper than Wanderlog Pro?",
            answer: `For one or two months, yes: Localley Pro is $${pro.price} a month, Wanderlog Pro starts at $16.99 a month. New Localley Pro subscribers also get the first ${PRO_TRIAL_DAYS} days free. For a full year Wanderlog is cheaper: from $39.99 against $${pro.yearlyPrice}.`,
        },
        {
            question: "Can my friends edit a Localley plan with me?",
            answer: "You can share a read-only link, so tripmates see the same days and spots. Localley has no live group editing. If your group wants to edit the plan together, Wanderlog is the better pick.",
        },
        {
            question: "Which cities does Localley plan?",
            answer: "Seoul, Tokyo, Bangkok and Singapore today. For other destinations, use Wanderlog or another general planner.",
        },
        {
            question: "Can I move my Wanderlog trip to Localley?",
            answer: "There is no direct import. Save the Wanderlog trip as a PDF, then let Localley plan the same city and days and swap in the stops you already booked.",
        },
    ],
    sources: [
        { label: "Wanderlog on the U.S. App Store (features and in-app prices)", url: APP_STORE },
        { label: "Wanderlog Pro pricing", url: WL_PRO },
        { label: "Wanderlog help: Is Wanderlog free?", url: WL_FREE_HELP },
        { label: "Wanderlog help: Print your trip", url: WL_PRINT_HELP },
        { label: "Wanderlog help: Offline access", url: WL_OFFLINE_HELP },
        { label: "Wanderlog help: Forward reservation emails", url: WL_IMPORT_HELP },
        { label: "Localley pricing", url: "https://www.localley.io/pricing" },
    ],
} as const;

export function usd(value: number): string {
    return `$${value.toFixed(2)}`;
}
