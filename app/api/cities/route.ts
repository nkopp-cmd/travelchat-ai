import { NextResponse } from "next/server";
import { isPreviewCitiesCandidate, previewImportedCities } from "@/lib/app-data/preview-cities";
import { NextRequest } from "next/server";
import { fetchCitiesWithCounts, getCachedCities, THRESHOLDS, type CityWithCount } from "@/lib/cities-catalog";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minSpots = parseInt(searchParams.get("minSpots") || "0");
    const includeHidden = searchParams.get("includeHidden") === "true";
    const noCache = searchParams.get("noCache") === "true";

    // Allow bypassing cache for debugging
    const candidate = isPreviewCitiesCandidate(request);
    let cities: CityWithCount[];
    if (candidate) {
      try {
        cities = await previewImportedCities();
      } catch (error) {
        console.error("[api/cities] Preview catalog unavailable:", error);
        return NextResponse.json({ success: false, error: "Candidate catalog unavailable", cities: [], total: 0 },
          { status: 503, headers: { "X-Localley-Data-Source": "d1-preview" } });
      }
    } else {
      cities = noCache ? await fetchCitiesWithCounts() : await getCachedCities();
    }

    const filtered = cities
      .filter(c => c.spotCount >= minSpots)
      .filter(c => includeHidden || c.status !== "hidden")
      .sort((a, b) => b.spotCount - a.spotCount);

    return NextResponse.json({
      success: true,
      cities: filtered,
      total: filtered.length,
      thresholds: THRESHOLDS,
    }, candidate ? { headers: { "X-Localley-Data-Source": "d1-preview" } } : undefined);
  } catch (error) {
    console.error("[api/cities] Error fetching cities:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch cities", cities: [], total: 0 },
      { status: 500 }
    );
  }
}
