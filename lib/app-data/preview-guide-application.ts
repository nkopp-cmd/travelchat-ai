import "server-only";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";

interface ApplicationRow {
  id: string;
  clerkUserId: string;
  status: string;
  bio: string | null;
  specialties: string;
  cities: string;
  appliedAt: string;
}

export interface GuideApplication {
  id: string;
  clerkUserId: string;
  bio: string | null;
  specialties: string[];
  cities: string[];
  appliedAt: string;
}

export function isPreviewGuideApplicationCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

function parseRow(row: ApplicationRow | null): GuideApplication | null {
  if (!row) return null;
  const specialties: unknown = JSON.parse(row.specialties);
  const cities: unknown = JSON.parse(row.cities);
  const bounded = (items: unknown): items is string[] => Array.isArray(items) && items.length <= 12
    && items.every(item => typeof item === "string" && item.length > 0 && item.length <= 80);
  if (typeof row.id !== "string" || !row.id || row.id.length > 128
    || typeof row.clerkUserId !== "string" || !row.clerkUserId || row.clerkUserId.length > 256
    || row.status !== "pending" || typeof row.bio !== "string" || !row.bio || row.bio.length > 2000
    || typeof row.appliedAt !== "string" || !Number.isFinite(Date.parse(row.appliedAt))
    || !bounded(specialties) || !bounded(cities) || cities.length === 0) {
    throw new Error("Invalid preview guide application");
  }
  return { id: row.id, clerkUserId: row.clerkUserId, bio: row.bio,
    specialties: specialties as string[], cities: cities as string[], appliedAt: row.appliedAt };
}

export async function readPreviewGuideApplication(userId: string): Promise<GuideApplication | null> {
  if (!userId || userId.length > 256) throw new Error("Invalid guide owner");
  const row = await previewAppDataReader().prepare(
    "SELECT id, clerkUserId, status, bio, specialties, cities, appliedAt FROM preview_guide_applications WHERE clerkUserId = ?",
  ).bind(userId).first<ApplicationRow>();
  return parseRow(row);
}

/** Bounded pending applications for an authorized preview admin list. */
export async function listPreviewGuideApplications(): Promise<GuideApplication[]> {
  const { results } = await previewAppDataReader().prepare(
    "SELECT id, clerkUserId, status, bio, specialties, cities, appliedAt FROM preview_guide_applications ORDER BY appliedAt DESC, id DESC LIMIT 101",
  ).all<ApplicationRow>();
  if (!Array.isArray(results) || results.length > 100) throw new Error("Guide applications unavailable");
  return results.map(row => {
    const application = parseRow(row);
    if (!application) throw new Error("Invalid preview guide application");
    return application;
  });
}

export function parseGuideApplication(value: unknown): { bio: string; specialties: string[]; cities: string[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const list = (entry: unknown): string[] | null => {
    if (!Array.isArray(entry) || entry.length > 12 || !entry.every(item =>
      typeof item === "string" && item.trim().length > 0 && item.trim().length <= 80)) return null;
    return entry.map(item => item.trim());
  };
  const specialties = list(body.specialties);
  const cities = list(body.cities);
  if (typeof body.bio !== "string" || !body.bio.trim() || body.bio.trim().length > 2000
    || !specialties || !cities || cities.length === 0) return null;
  return { bio: body.bio.trim(), specialties, cities };
}

export async function createPreviewGuideApplication(userId: string, input: {
  bio: string; specialties: string[]; cities: string[];
}): Promise<GuideApplication> {
  if (!userId || userId.length > 256) throw new Error("Invalid guide owner");
  const db = previewAppDataReader();
  await db.prepare("INSERT INTO preview_guide_applications (id, clerkUserId, bio, specialties, cities, appliedAt) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(clerkUserId) DO NOTHING")
    .bind(crypto.randomUUID(), userId, input.bio, JSON.stringify(input.specialties), JSON.stringify(input.cities), new Date().toISOString()).run();
  const result = await readPreviewGuideApplication(userId);
  if (!result) throw new Error("Guide application was not saved");
  return result;
}
