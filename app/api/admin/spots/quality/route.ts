import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
    buildSpotQualityPatchPayload,
    getQueueLimit,
    getSpotQualityQueue,
    type SpotQualityIssue,
    type SpotQualityPatchInput,
} from "@/lib/admin/spot-quality";

const VALID_ISSUES = new Set<SpotQualityIssue | "all">([
    "all",
    "missing_real_photo",
    "inexact_location",
    "missing_place_id",
    "mismatched_place_photo_identity",
    "broad_place_name",
    "missing_name",
]);

function getIssue(value: string | null): SpotQualityIssue | "all" {
    return VALID_ISSUES.has(value as SpotQualityIssue | "all")
        ? (value as SpotQualityIssue | "all")
        : "all";
}

export async function GET(req: NextRequest) {
    const { response } = await requireAdmin("/api/admin/spots/quality", "list_spot_quality");
    if (response) return response;

    const supabase = createSupabaseAdmin();
    const city = req.nextUrl.searchParams.get("city");
    const issue = getIssue(req.nextUrl.searchParams.get("issue"));
    const limit = getQueueLimit(req.nextUrl.searchParams.get("limit"));

    try {
        const queue = await getSpotQualityQueue(supabase, { city, issue, limit });
        return NextResponse.json(queue);
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to load spot quality queue",
                details: error instanceof Error ? error.message : "unknown_error",
            },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    const { response, userId } = await requireAdmin("/api/admin/spots/quality", "update_spot_quality");
    if (response) return response;

    let body: SpotQualityPatchInput & { id?: string };
    try {
        body = (await req.json()) as SpotQualityPatchInput & { id?: string };
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const id = body.id?.trim();
    if (!id) {
        return NextResponse.json({ error: "Spot id is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    let hasGooglePlaceIdColumn = true;
    let current;

    try {
        let result = await supabase
            .from("spots")
            .select("id, name, address, description, photos, category, location, google_place_id, created_at")
            .eq("id", id)
            .single();

        if (result.error && /google_place_id/i.test(result.error.message)) {
            hasGooglePlaceIdColumn = false;
            result = await supabase
                .from("spots")
                .select("id, name, address, description, photos, category, location, created_at")
                .eq("id", id)
                .single();
        }

        if (result.error || !result.data) {
            return NextResponse.json(
                { error: "Spot not found", details: result.error?.message || "missing_row" },
                { status: 404 }
            );
        }

        current = result.data;
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to fetch spot",
                details: error instanceof Error ? error.message : "unknown_error",
            },
            { status: 500 }
        );
    }

    let updatePayload;
    try {
        updatePayload = buildSpotQualityPatchPayload(current, body, hasGooglePlaceIdColumn);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Invalid update payload" },
            { status: 400 }
        );
    }

    const { data, error } = await supabase
        .from("spots")
        .update(updatePayload)
        .eq("id", id)
        .select(hasGooglePlaceIdColumn
            ? "id, name, address, description, photos, category, location, google_place_id, created_at"
            : "id, name, address, description, photos, category, location, created_at")
        .single();

    if (error || !data) {
        return NextResponse.json(
            {
                error: "Failed to update spot",
                details: error?.message || "missing_updated_row",
            },
            { status: 500 }
        );
    }

    revalidateTag("spots", "default");

    return NextResponse.json({
        success: true,
        updatedBy: userId,
        updatedFields: Object.keys(updatePayload),
        hasGooglePlaceIdColumn,
        item: data,
    });
}
