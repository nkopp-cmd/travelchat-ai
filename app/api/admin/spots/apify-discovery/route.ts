import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { mapApifyCategory } from "@/lib/apify-spot-discovery";
import { createSupabaseAdmin } from "@/lib/supabase";

const VALID_STATUSES = new Set(["pending", "rejected", "imported"]);
const IMPORT_CLAIM_STALE_MINUTES = 15;

async function reconcileStaleImports(): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const staleBefore = new Date(Date.now() - IMPORT_CLAIM_STALE_MINUTES * 60 * 1_000).toISOString();
  const { data: staleCandidates, error } = await supabase
    .from("apify_spot_candidates")
    .select("id,place_id")
    .eq("status", "importing")
    .lt("reviewed_at", staleBefore)
    .limit(50);
  if (error) return "Failed to reconcile stale import claims";
  if (!staleCandidates?.length) return null;

  const placeIds = staleCandidates.map((candidate) => candidate.place_id);
  const { data: spots, error: spotsError } = await supabase
    .from("spots")
    .select("id,google_place_id")
    .in("google_place_id", placeIds);
  if (spotsError) return "Failed to reconcile stale import claims";
  const spotsByPlaceId = new Map((spots || []).map((spot) => [spot.google_place_id, spot.id]));
  const results = await Promise.all(staleCandidates.map((candidate) => {
    const spotId = spotsByPlaceId.get(candidate.place_id);
    return supabase
      .from("apify_spot_candidates")
      .update(spotId
        ? { status: "imported", imported_spot_id: spotId, updated_at: new Date().toISOString() }
        : { status: "pending", reviewed_at: null, updated_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", "importing");
  }));
  return results.some((result) => result.error) ? "Failed to reconcile stale import claims" : null;
}

function getLimit(value: string | null): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : 80;
}

function formatPoint(longitude: number, latitude: number): string {
  return `POINT(${longitude.toFixed(7)} ${latitude.toFixed(7)})`;
}

export async function GET(request: NextRequest) {
  const { response } = await requireAdmin("/api/admin/spots/apify-discovery", "list_apify_spot_candidates");
  if (response) return response;
  const reconciliationError = await reconcileStaleImports();
  if (reconciliationError) return NextResponse.json({ error: reconciliationError }, { status: 500 });
  const statusParam = request.nextUrl.searchParams.get("status") || "pending";
  const status = VALID_STATUSES.has(statusParam) ? statusParam : "pending";
  const city = request.nextUrl.searchParams.get("city")?.trim();
  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("apify_spot_candidates")
    .select("*")
    .eq("status", status)
    .order("recommended_localley_score", { ascending: false })
    .order("total_score", { ascending: false })
    .limit(getLimit(request.nextUrl.searchParams.get("limit")));
  if (city) query = query.eq("city_slug", city);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load Apify spot candidates" }, { status: 500 });
  }
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    status,
    city: city || null,
    items: data || [],
  });
}

export async function PATCH(request: NextRequest) {
  const { response } = await requireAdmin("/api/admin/spots/apify-discovery", "review_apify_spot_candidate");
  if (response) return response;
  const reconciliationError = await reconcileStaleImports();
  if (reconciliationError) return NextResponse.json({ error: reconciliationError }, { status: 500 });
  let body: { id?: string; action?: string; localleyScore?: number; rejectionReason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = body.id?.trim();
  if (!id || !["approve", "reject"].includes(body.action || "")) {
    return NextResponse.json({ error: "Candidate id and valid action are required" }, { status: 400 });
  }
  const supabase = createSupabaseAdmin();
  const { data: candidate, error: candidateError } = await supabase
    .from("apify_spot_candidates")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();
  if (candidateError) return NextResponse.json({ error: "Failed to load candidate" }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "Pending candidate not found" }, { status: 404 });

  if (body.action === "reject") {
    const { data: rejected, error } = await supabase
      .from("apify_spot_candidates")
      .update({
        status: "rejected",
        rejection_reason: body.rejectionReason?.trim().slice(0, 500) || "Rejected during admin review",
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Failed to reject candidate" }, { status: 500 });
    if (!rejected) return NextResponse.json({ error: "Candidate is no longer pending" }, { status: 409 });
    return NextResponse.json({ success: true, status: "rejected" });
  }

  const score = Number.isInteger(body.localleyScore) && body.localleyScore! >= 3 && body.localleyScore! <= 5
    ? body.localleyScore!
    : candidate.recommended_localley_score;
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("apify_spot_candidates")
    .update({ status: "importing", reviewed_at: claimedAt, updated_at: claimedAt })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: "Failed to claim candidate" }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: "Candidate is no longer pending" }, { status: 409 });

  const { data: existing, error: existingError } = await supabase
    .from("spots")
    .select("id")
    .eq("google_place_id", candidate.place_id)
    .maybeSingle();
  if (existingError) {
    await supabase.from("apify_spot_candidates").update({ status: "pending", reviewed_at: null }).eq("id", id).eq("status", "importing");
    return NextResponse.json({ error: "Failed to check existing spots" }, { status: 500 });
  }

  let spotId = existing?.id as string | undefined;
  if (!spotId) {
    const category = mapApifyCategory(candidate.category_name, candidate.categories || []);
    const { data: inserted, error: insertError } = await supabase
      .from("spots")
      .insert({
        name: { en: candidate.name },
        description: {
          en: `${candidate.name} is a locally reviewed ${category.toLowerCase()} spot in ${candidate.city_slug.replaceAll("-", " ")}.`,
        },
        location: formatPoint(candidate.longitude, candidate.latitude),
        address: { en: candidate.address },
        category,
        subcategories: (candidate.categories || []).slice(0, 8),
        localley_score: score,
        local_percentage: score === 5 ? 85 : score === 4 ? 70 : 55,
        best_times: {},
        photos: [candidate.primary_image_url],
        google_place_id: candidate.place_id,
        tips: [],
        verified: true,
        trending_score: 0,
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      await supabase.from("apify_spot_candidates").update({ status: "pending", reviewed_at: null }).eq("id", id).eq("status", "importing");
      return NextResponse.json({ error: "Failed to create approved spot" }, { status: 500 });
    }
    spotId = inserted.id;
  }

  const { data: imported, error: updateError } = await supabase
    .from("apify_spot_candidates")
    .update({
      status: "imported",
      imported_spot_id: spotId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "importing")
    .select("id")
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: "Spot created but candidate status update failed" }, { status: 500 });
  if (!imported) return NextResponse.json({ error: "Spot created but candidate claim was lost" }, { status: 409 });
  revalidateTag("spots", "default");
  return NextResponse.json({ success: true, status: "imported", spotId });
}
