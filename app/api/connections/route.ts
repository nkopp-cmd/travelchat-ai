import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";

/**
 * GET /api/connections - Query transport connections between cities
 *
 * Query params:
 * - from: origin city slug (required)
 * - to: destination city slug (optional, returns all from origin if omitted)
 * - type: transport type filter (optional: 'flight' | 'train' | 'bus' | 'ferry')
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");

    if (!from) {
      return Errors.validationError("'from' query parameter is required");
    }

    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("city_connections")
      .select("*")
      .eq("from_city", from);

    if (to) {
      query = query.eq("to_city", to);
    }

    if (type) {
      query = query.eq("transport_type", type);
    }

    const { data, error } = await query.order("duration_minutes", { ascending: true });

    if (error) {
      console.error("[connections] Supabase error:", error);
      return Errors.internalError("Failed to fetch connections");
    }

    return NextResponse.json({
      connections: data || [],
      count: data?.length || 0,
    });
  } catch (err) {
    return handleApiError(err, "connections");
  }
}
