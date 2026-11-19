const MAX_REVENUE_SHARE_PERCENT = 50;
const DEFAULT_REVENUE_SHARE_PERCENT = 20;

type CalculateInput = { month?: Date; subscriptionRevenue?: number; revenueSharePercent: number };

// Push AR2: an admin typo must not pay guides more than the share or from a negative pool.
// Absent fields take their default; a present field must be valid or the request is refused (400).
export function parseCalculateBody(body: unknown): { ok: true; value: CalculateInput } | { ok: false; field: string } {
    if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, field: "body" };
    const b = body as Record<string, unknown>;
    let month: Date | undefined;
    if (b.month !== undefined) {
        if (typeof b.month !== "string" || !/^\d{4}-\d{2}-01$/.test(b.month)) return { ok: false, field: "month" };
        month = new Date(`${b.month}T00:00:00Z`);
        if (Number.isNaN(month.getTime()) || month.toISOString().slice(0, 10) !== b.month) return { ok: false, field: "month" };
    }
    let subscriptionRevenue: number | undefined;
    if (b.subscriptionRevenue !== undefined) {
        const v = b.subscriptionRevenue;
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { ok: false, field: "subscriptionRevenue" };
        subscriptionRevenue = v;
    }
    let revenueSharePercent = DEFAULT_REVENUE_SHARE_PERCENT;
    if (b.revenueSharePercent !== undefined) {
        const v = b.revenueSharePercent;
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > MAX_REVENUE_SHARE_PERCENT) {
            return { ok: false, field: "revenueSharePercent" };
        }
        revenueSharePercent = v;
    }
    return { ok: true, value: { month, subscriptionRevenue, revenueSharePercent } };
}
