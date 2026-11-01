// Launch attribution without a schema change (shared/plans/launch-marketing.md "Analytics"):
// one Analytics Engine data point per session that lands with a utm_source or from another
// site. No IP, no user id, no cookie. The public pages are static assets, so a tiny inline
// beacon (REFERRAL_BEACON_SCRIPT) reports the landing; scripts/referral-report.py reads the
// dataset once a week.
export const REFERRAL_DATASET = "localley_referrals";
export const REFERRAL_URL = "/api/events/referral";
const OWN_HOSTS = /(^|\.)localley\.(io|app)$/i;

const clean = (value: unknown, max = 40) =>
    (typeof value === "string" ? value : "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, max);

export type ReferralPoint = { blobs: string[]; indexes: string[] };

/** Validates a beacon body ({s, m, c, r, p}); null when there is nothing outside to count. */
export function referralPoint(body: unknown): ReferralPoint | null {
    if (!body || typeof body !== "object") return null;
    const { s, m, c, r, p } = body as Record<string, unknown>;
    const source = clean(s);
    const host = clean(r, 80);
    const refHost = host && !OWN_HOSTS.test(host) ? host : "";
    if (!source && !refHost) return null;
    const path = typeof p === "string" && p.startsWith("/") ? p.replace(/[^\w\-./]/g, "").slice(0, 100) : "";
    return {
        // Order is the report's column order: blob1..blob5.
        blobs: [source, clean(m), clean(c, 60), refHost, path],
        indexes: [source || refHost],
    };
}

// Runs once per tab session on the landing page; sends nothing for internal navigation.
export const REFERRAL_BEACON_SCRIPT =
    `try{var q=new URLSearchParams(location.search),s=q.get("utm_source"),r="";try{r=new URL(document.referrer).hostname}catch(e){}` +
    `if(${OWN_HOSTS}.test(r))r="";if((s||r)&&!sessionStorage.getItem("ll_ref")){sessionStorage.setItem("ll_ref","1");` +
    `navigator.sendBeacon("${REFERRAL_URL}",JSON.stringify({s:s,m:q.get("utm_medium"),c:q.get("utm_campaign"),r:r,p:location.pathname}))}}catch(e){}`;
