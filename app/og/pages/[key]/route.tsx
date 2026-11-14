import { ImageResponse } from "next/og";
import { pageCard } from "@/lib/seo/page-card";
import { headlineSize } from "@/lib/seo/spot-card";

// Share card (og:image) for home, pricing, templates and the help pages. Satori needs the Node.js runtime here.
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const card = pageCard((await params).key);
  if (!card) return notFound();

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
          <div style={{ display: "flex", marginTop: 20, fontSize: 38, color: "rgba(255,255,255,0.88)" }}>{card.subline}</div>
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
