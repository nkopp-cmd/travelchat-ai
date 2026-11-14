import { ImageResponse } from "next/og";
import { dataBackend } from "@/lib/app-data/backend";
import { d1SpotSource } from "@/lib/spots/d1-queries";
import { createSupabaseAdmin } from "@/lib/supabase";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import { normalizeLocalleyScore } from "@/lib/spots/detail-normalization";
import { inferSpotContextCity } from "@/lib/spots/city-context";
import { getSpotCoordinateValues } from "@/lib/spots/coordinates";
import { headlineSize, spotCardText } from "@/lib/seo/spot-card";

// Per-spot share card (og:image) for spot pages without an own photo. Satori needs the Node.js runtime here.
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const text = (field: unknown): string => {
  if (typeof field === "string") return field;
  if (field && typeof field === "object") {
    const value = field as Record<string, unknown>;
    return String(value.en || Object.values(value)[0] || "");
  }
  return "";
};

async function readSpot(id: string): Promise<Record<string, unknown> | null> {
  if (dataBackend() === "d1") return d1SpotSource(id);
  const { data, error } = await createSupabaseAdmin().from("spots").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load spot: ${error.message}`);
  return data;
}

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const spot = await readSpot(id);
  if (!spot || !shouldShowPublicSpot({
    name: spot.name as never, address: spot.address as never, location: spot.location as never,
    photos: spot.photos as never, google_place_id: spot.google_place_id as never,
  })) return notFound();

  const name = text(spot.name);
  const address = text(spot.address);
  const { lat, lng } = getSpotCoordinateValues(spot.location as never);
  const card = spotCardText({
    name,
    category: typeof spot.category === "string" ? spot.category : "Local spot",
    score: normalizeLocalleyScore(spot.localley_score as never),
    city: inferSpotContextCity({ name, address, lat, lng }),
  });

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "64px 72px", background: "linear-gradient(135deg, #1e1b4b 0%, #6d28d9 55%, #db2777 100%)", color: "white",
        fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
          <span style={{ display: "flex", padding: "8px 20px", borderRadius: 999, background: "rgba(255,255,255,0.16)" }}>
            {card.label}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: headlineSize(card.headline), fontWeight: 800, lineHeight: 1.1 }}>{card.headline}</div>
          {card.place ? <div style={{ display: "flex", marginTop: 20, fontSize: 38, color: "rgba(255,255,255,0.88)" }}>{card.place}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <span style={{ display: "flex", fontWeight: 800, fontSize: 40 }}>Localley</span>
          <span style={{ display: "flex", color: "rgba(255,255,255,0.8)" }}>Local tips · localley.io</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  // ImageResponse streams lazily: read it fully so a render error becomes a 500, not a broken PNG.
  const png = await image.arrayBuffer();
  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=604800" },
  });
}
