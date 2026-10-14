import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ list: vi.fn(), retrieve: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("stripe", () => { const S = vi.fn(function () { return { customers: m }; }); return { default: Object.assign(S, { createFetchHttpClient: () => ({}) }) }; });
let customer: typeof import("@/lib/stripe").getOrCreateStripeCustomer;
beforeEach(async () => { vi.resetAllMocks(); vi.resetModules(); vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_unit_fixture"); customer = (await import("@/lib/stripe")).getOrCreateStripeCustomer; m.list.mockResolvedValue({ data: [], has_more: false }); m.create.mockResolvedValue({ id: "cus_new" }); });
afterEach(() => vi.unstubAllEnvs());
describe("Stripe customer identity", () => {
  it("never reassigns a matching-email foreign customer", async () => {
    m.list.mockResolvedValue({ data: [{ id: "cus_foreign", metadata: { clerk_user_id: "other" } }], has_more: false });
    expect(await customer("a", "same@example.com")).toBe("cus_new"); expect(m.update).not.toHaveBeenCalled();
    expect(m.create.mock.calls[0]).toEqual([{ email: "same@example.com", name: undefined, metadata: { clerk_user_id: "a" } }, { idempotencyKey: "localley-customer-v1-a" }]);
  });
  it("reuses only an exact metadata owner in an email search", async () => {
    m.list.mockResolvedValue({ data: [{ id: "cus_foreign", metadata: {} }, { id: "cus_owned", metadata: { clerk_user_id: "a" } }], has_more: false });
    expect(await customer("a", "same@example.com")).toBe("cus_owned"); expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it("uses the stored association even after an email change", async () => {
    m.retrieve.mockResolvedValue({ id: "cus_owned", metadata: { clerk_user_id: "a" } });
    expect(await customer("a", "new@example.com", undefined, "cus_owned")).toBe("cus_owned"); expect(m.list).not.toHaveBeenCalled();
  });
  it.each([{ id: "cus_foreign", metadata: { clerk_user_id: "other" } }, { id: "cus_deleted", deleted: true }])("refuses a conflicting stored customer %j", async row => {
    m.retrieve.mockResolvedValue(row); await expect(customer("a", "same@example.com", undefined, row.id)).rejects.toThrow(/owner mismatch/); expect(m.create).not.toHaveBeenCalled();
  });
  it("retains a trusted stored association with no legacy metadata", async () => {
    m.retrieve.mockResolvedValue({ id: "cus_owned", metadata: {} });
    expect(await customer("a", "same@example.com", undefined, "cus_owned")).toBe("cus_owned"); expect(m.update).not.toHaveBeenCalled();
  });
  it.each([{ data: [], has_more: true }, { data: [{ id: "1", metadata: { clerk_user_id: "a" } }, { id: "2", metadata: { clerk_user_id: "a" } }], has_more: false }])("refuses ambiguous lookup %j", async data => {
    m.list.mockResolvedValue(data); await expect(customer("a", "same@example.com")).rejects.toThrow(/ambiguous/); expect(m.create).not.toHaveBeenCalled();
  });
});
