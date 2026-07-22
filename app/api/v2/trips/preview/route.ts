import { NextRequest, NextResponse } from "next/server";
import { rateLimiters } from "@/lib/rate-limit";
import {
  MultiCityTripRequestSchema,
  PlannerValidationError,
  planCorridorTrip,
  type CorridorPlan,
} from "@/lib/trips/corridor-planner";

const MAX_BODY_BYTES = 32 * 1024;
const noStoreHeaders = { "Cache-Control": "no-store" };

type ErrorCode =
  | "INVALID_REQUEST"
  | "UNKNOWN_DESTINATION"
  | "UNSUPPORTED_ROUTE"
  | "UNSATISFIABLE_TRIP"
  | "INTERNAL";

function errorResponse(status: number, code: ErrorCode, message: string, issues?: Array<{ path: string; message: string }>) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(issues ? { issues } : {}) } },
    { status, headers: noStoreHeaders },
  );
}

async function readBoundedBody(request: Request): Promise<
  | { ok: true; text: string }
  | { ok: false; response: NextResponse }
> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && !/^\d+$/.test(declaredLength)) {
    return { ok: false, response: errorResponse(400, "INVALID_REQUEST", "Content-Length must be a non-negative integer.") };
  }
  if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
    return { ok: false, response: errorResponse(413, "INVALID_REQUEST", "Request body is too large.") };
  }

  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: errorResponse(413, "INVALID_REQUEST", "Request body is too large.") };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { ok: true, text };
}

function confidenceBand(value: number): "high" | "medium" | "low" {
  return value >= 0.9 ? "high" : value >= 0.8 ? "medium" : "low";
}

function costBand(value: "budget" | "moderate" | "premium"): "$" | "$$" | "$$$" {
  return value === "budget" ? "$" : value === "moderate" ? "$$" : "$$$";
}

export function toPreviewDto(plan: CorridorPlan) {
  return {
    plannerVersion: plan.plannerVersion,
    stops: plan.stops.map((stop) => ({
      position: stop.position,
      destinationSlug: stop.destinationSlug,
      nights: stop.nights,
      dayIndexes: plan.days
        .filter((day) => day.destinationSlug === stop.destinationSlug)
        .map((day) => day.dayIndex),
    })),
    transfers: plan.transfers.map((transfer) => ({
      position: transfer.position,
      fromSlug: transfer.from,
      toSlug: transfer.to,
      mode: transfer.mode,
      durationMinutes: transfer.durationMinutes,
      terminalBufferMinutes: transfer.terminalBufferMinutes,
      costBand: costBand(transfer.costBand),
      confidence: confidenceBand(transfer.confidence),
    })),
    days: plan.days.map((day) => ({
      dayIndex: day.dayIndex,
      destinationSlug: day.destinationSlug,
      type: day.type,
      activeMinutesBudget: day.activeMinutesBudget,
    })),
    warnings: plan.days.some((day) => day.type === "transfer" && day.activeMinutesBudget === 0)
      ? ["TRANSFER_DAY_FULL"]
      : [],
  };
}

function classifyPlannerError(error: PlannerValidationError): { code: Exclude<ErrorCode, "INVALID_REQUEST" | "INTERNAL">; message: string } {
  const message = error.issues.map((issue) => issue.message).join(" ");
  if (error.issues.some((issue) => issue.code === "UNKNOWN_DESTINATION")) {
    return { code: "UNKNOWN_DESTINATION", message };
  }
  if (error.issues.some((issue) => issue.code === "UNSUPPORTED_ROUTE")) {
    return { code: "UNSUPPORTED_ROUTE", message };
  }
  return { code: "UNSATISFIABLE_TRIP", message };
}

export async function POST(request: NextRequest) {
  if (process.env.MULTI_CITY_PREVIEW_API !== "on") {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStoreHeaders });
  }

  const limited = await rateLimiters.strict(request);
  if (limited) return limited;

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return errorResponse(415, "INVALID_REQUEST", "Content-Type must be application/json.");
  }

  try {
    const body = await readBoundedBody(request);
    if (!body.ok) return body.response;
    const { text } = body;

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return errorResponse(400, "INVALID_REQUEST", "Request body must be valid JSON.");
    }

    const parsed = MultiCityTripRequestSchema.safeParse(value);
    if (!parsed.success) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Request validation failed.",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    try {
      const plan = planCorridorTrip(parsed.data);
      return NextResponse.json(
        { ok: true, preview: toPreviewDto(plan) },
        { headers: noStoreHeaders },
      );
    } catch (error) {
      if (error instanceof PlannerValidationError) {
        const classified = classifyPlannerError(error);
        return errorResponse(422, classified.code, classified.message);
      }
      throw error;
    }
  } catch (error) {
    console.error("[multi-city-preview] Unexpected error", error);
    return errorResponse(500, "INTERNAL", "Unable to create a trip preview.");
  }
}
