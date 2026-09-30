// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.currentUser }));
import { assertPreviewReviewUser, createPreviewSpotReview, deletePreviewSpotReview,
  isPreviewSpotReviewCandidate, parseReviewInput, previewSpotReviews,
  updatePreviewSpotReview, votePreviewSpotReview } from "@/lib/app-data/preview-spot-reviews";

const spot = "11111111-1111-4111-8111-111111111111";
const otherSpot = "22222222-2222-4222-8222-222222222222";
let db: D1Sqlite;
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT UNIQUE);
    CREATE TABLE spots(id TEXT PRIMARY KEY, visible INTEGER NOT NULL);
    INSERT INTO spots VALUES ('${spot}',1),('${otherSpot}',0);`);
  db.sqlite.exec(readFileSync(path.resolve(__dirname,
    "../../migrations/app-preview/0023_preview_spot_reviews.sql"), "utf8"));
  mocks.reader.mockReturnValue(db);
  mocks.currentUser.mockResolvedValue({ id: "alice", emailVerified: true,
    primaryEmailAddress: { emailAddress: "alice@preview.localley.test" } });
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("preview spot reviews", () => {
  it("requires the isolated preview host and a verified reserved account for writes", async () => {
    vi.stubEnv("AUTH_MAIL_MODE", "outbox"); vi.stubEnv("SUPABASE_READ_ONLY", "true");
    const path = `/api/spots/${spot}/reviews?data_candidate=d1`;
    expect(isPreviewSpotReviewCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}`))).toBe(true);
    expect(isPreviewSpotReviewCandidate(new NextRequest(`https://www.localley.io${path}`))).toBe(false);
    expect(isPreviewSpotReviewCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev/api/spots/${spot}/reviews`))).toBe(false);
    await expect(assertPreviewReviewUser("alice")).resolves.toBeUndefined();
    await expect(assertPreviewReviewUser("bob")).rejects.toThrow();
    db.sqlite.exec("INSERT INTO owners VALUES ('legacy','legacy-fixture'); INSERT INTO legacy_owners VALUES ('legacy','alice')");
    await expect(assertPreviewReviewUser("alice")).rejects.toThrow();
  });

  it("validates rating, comment and visit date", () => {
    expect(parseReviewInput({ rating: 5, comment: "Good", visitDate: "2026-09-30" }))
      .toEqual({ rating: 5, comment: "Good", visitDate: "2026-09-30" });
    expect(parseReviewInput({ rating: 0 })).toBeNull();
    expect(parseReviewInput({ rating: 5 })).toEqual({ rating: 5, comment: null, visitDate: null });
    expect(parseReviewInput({ rating: 2.5 })).toBeNull();
    expect(parseReviewInput({ rating: 5, comment: "x".repeat(1001) })).toBeNull();
    expect(parseReviewInput({ rating: 5, visitDate: "bad" })).toBeNull();
    expect(parseReviewInput({ comment: null }, true)).toEqual({ comment: null });
  });

  it("creates, lists, updates and deletes an exact-owner review", async () => {
    const input = { rating: 4, comment: "Quiet", visitDate: "2026-09-30" };
    const first = await createPreviewSpotReview(spot, "alice", input);
    expect(first.state).toBe("created");
    if (first.state !== "created") throw new Error("Expected review");
    const id = first.review.id;
    expect(await createPreviewSpotReview(spot, "alice", input)).toEqual({ state: "duplicate" });
    expect(await createPreviewSpotReview(otherSpot, "alice", input)).toEqual({ state: "missing" });
    expect(await previewSpotReviews(spot, "alice", "recent", 20, 0)).toMatchObject({
      total: 1, averageRating: 4, ratingDistribution: [0, 0, 0, 1, 0],
      reviews: [{ id, rating: 4, user_voted: false }],
    });
    expect(await updatePreviewSpotReview(spot, id, "bob", { rating: 5 })).toEqual({ state: "forbidden" });
    expect(await updatePreviewSpotReview(otherSpot, id, "alice", { rating: 5 })).toEqual({ state: "missing" });
    expect(await updatePreviewSpotReview(spot, id, "alice", { rating: 5, comment: null }))
      .toMatchObject({ state: "updated", review: { rating: 5, comment: null } });
    expect((await previewSpotReviews(spot, null, "highest", 20, 0)).averageRating).toBe(5);
    expect(await deletePreviewSpotReview(spot, id, "bob")).toBe("forbidden");
    expect(await deletePreviewSpotReview(spot, id, "alice")).toBe("deleted");
    expect((await previewSpotReviews(spot, null, "recent", 20, 0)).total).toBe(0);
  });

  it("counts helpful votes, blocks self and duplicate votes, and cascades on delete", async () => {
    const first = await createPreviewSpotReview(spot, "alice", { rating: 5, comment: null, visitDate: null });
    if (first.state !== "created") throw new Error("Expected review");
    const id = first.review.id;
    expect(await votePreviewSpotReview(spot, id, "alice", true)).toEqual({ state: "own" });
    expect(await votePreviewSpotReview(otherSpot, id, "bob", true)).toEqual({ state: "missing" });
    expect(await votePreviewSpotReview(spot, id, "bob", true))
      .toEqual({ state: "voted", helpful_count: 1, voted: true });
    expect(await votePreviewSpotReview(spot, id, "bob", true))
      .toEqual({ state: "duplicate", helpful_count: 1, voted: true });
    expect((await previewSpotReviews(spot, "bob", "helpful", 20, 0)).reviews[0])
      .toMatchObject({ helpful_count: 1, user_voted: true });
    expect(await votePreviewSpotReview(spot, id, "bob", false))
      .toEqual({ state: "voted", helpful_count: 0, voted: false });
    await votePreviewSpotReview(spot, id, "bob", true);
    await deletePreviewSpotReview(spot, id, "alice");
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_review_votes").get()).toEqual({ n: 0 });
  });
});
