import { ImageResponse } from "next/og";
import { createSupabaseAdmin } from "@/lib/supabase";
import { headlineSize } from "@/lib/seo/spot-card";

// Share card (og:image) for /shared/<code>. Text comes only from a row with shared = true, so the card shows
// nothing a visitor of the shared page cannot already read. /api/og stays closed: it renders free query text.
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });
const clip = (value: unknown, max: number) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

export async function GET(_request: Request, { params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  if (!/^[a-z0-9]{8}$/.test(shareCode)) return notFound();
  const { data, error } = await createSupabaseAdmin().from("itineraries")
    .select("title, city, days").eq("share_code", shareCode).eq("shared", true).maybeSingle();
  if (error) return new Response("Unavailable", { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } });
  if (!data) return notFound();

  const title = clip(data.title, 70) || "A local trip";
  const city = clip(data.city, 30);
  const days = Number.isSafeInteger(Number(data.days)) && Number(data.days) > 0 ? Number(data.days) : null;
  const subline = [days ? `${days}-day trip` : "Trip", city && `in ${city}`].filter(Boolean).join(" ");

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "64px 72px", background: "linear-gradient(135deg, #1e1b4b 0%, #6d28d9 55%, #db2777 100%)", color: "white",
        fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
          <span style={{ display: "flex", padding: "8px 20px", borderRadius: 999, background: "rgba(255,255,255,0.16)" }}>
            Shared trip
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: headlineSize(title), fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 38, color: "rgba(255,255,255,0.88)" }}>{subline}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <span style={{ display: "flex", fontWeight: 800, fontSize: 40 }}>Localley</span>
          <span style={{ display: "flex", color: "rgba(255,255,255,0.8)" }}>Plan yours free · localley.io</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  // ImageResponse streams lazily: read it fully so a render error becomes a 500, not a broken PNG.
  const png = await image.arrayBuffer();
  // One hour at the edge: an unshared trip stops showing its card within the hour.
  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}
