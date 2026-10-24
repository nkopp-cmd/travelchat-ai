import "server-only";
import type { PreviewAppDataReader, PreviewAppDataStatement } from "./preview-db";
import { GENERATED_SPECS } from "./d1-generated-specs";

/**
 * Supabase exit step 3 (shared/plans/localley-decisions.md 2026-10-24): a PostgREST-compatible query builder over
 * D1 for simple owner-rule tables. It supports exactly the chain methods the app uses; anything else throws.
 * Row-level security does not exist in D1, so each table spec re-implements its Postgres policy for the
 * user-scoped client (role "user"); role "service" matches the service-role key (no policy), "anon" the anon key.
 * Results mirror PostgREST: { data, error, count }, booleans and JSON decoded, PGRST116 for single() misses,
 * 42501 for a rejected insert, DESC orders NULLs first.
 */

type Kind = "text" | "int" | "real" | "bool" | "json" | "textArray" | "unsupported";
type Value = string | number | boolean | null | Record<string, unknown> | unknown[];
type Row = Record<string, Value>;
type Binding = string | number | null;
type Action = "select" | "insert" | "update" | "delete";

export interface TableSpec {
  /** D1 table name. */
  table: string;
  /** Postgres column -> kind and optional D1 name (same-table renames only). */
  columns: Record<string, { kind: Kind; d1?: string; default?: () => Binding }>;
  primaryKey: string[];
  /** Postgres column that holds the owning user id (RLS `clerk_user_id = jwt.sub`). */
  owner?: string;
  /** Owner rule as D1 SQL on alias t with one `?` for the user id, when the row has no owner column (e.g. messages). */
  ownerExpr?: string;
  /** Commands the user-scoped client has a Postgres policy for (default all). Others see no rows / get 42501. */
  userOps?: Action[];
  /** D1-only NOT NULL columns the facade fills on insert (never returned), e.g. saved_spots.createdAtMs. */
  d1Extra?: (row: Row) => Record<string, Binding>;
  /** Extra visible rows for role "user" on SELECT (Postgres permissive SELECT policy), as D1 SQL on the table alias t. */
  userReadAlso?: string;
  /** Postgres WITH CHECK beyond the owner rule, for inserts and update patches by role "user": a query that must
   *  return a row; the user id is bound after the returned params. */
  userWriteCheck?: (row: Row) => { sql: string; params: Binding[] } | null;
  /** BEFORE UPDATE trigger equivalent (e.g. updated_at = now()). */
  beforeUpdate?: (patch: Row) => Row;
  /** BEFORE UPDATE triggers that read OLD: SET expressions per Postgres column (column refs = old values). */
  updateSql?: (patch: Row) => Record<string, { sql: string; params: Binding[] }>;
  /** Postgres CHECK constraints the D1 table lacks: returns the violated constraint name, or null. */
  checks?: (row: Row) => string | null;
  /** AFTER INSERT trigger equivalent, run in the same batch. */
  afterInsert?: (row: Row) => { sql: string; params: Binding[] }[];
  /** Statements that must run before an insert (e.g. the owners row a foreign key needs). */
  beforeInsert?: (row: Row) => { sql: string; params: Binding[] }[];
  /** Role "anon" may read these rows (SQL on alias t); no anon writes. Omitted = anon sees nothing. */
  anonRead?: string;
}

export type D1Role = { role: "service" } | { role: "user"; userId: string } | { role: "anon" };

export interface PostgrestError { message: string; code: string; details: string | null; hint: string | null }
export interface PostgrestResult<T> { data: T | null; error: PostgrestError | null; count: number | null; status: number }

const error = (code: string, message: string, status = 400): PostgrestError & { status: number } =>
  ({ code, message, details: null, hint: null, status });

const uuid = () => crypto.randomUUID();
// Postgres timestamptz text as PostgREST returns it, e.g. 2026-10-24T17:32:11.615+00:00.
export const nowTimestamptz = () => new Date().toISOString().replace("Z", "+00:00");

export const TABLES: Record<string, TableSpec> = {
  itineraries: {
    table: "itineraries",
    primaryKey: ["id"],
    owner: "clerk_user_id",
    columns: {
      id: { kind: "text", default: uuid },
      user_id: { kind: "text" },
      title: { kind: "text" },
      city: { kind: "text" },
      days: { kind: "int" },
      activities: { kind: "json" },
      local_score: { kind: "real" },
      shared: { kind: "bool", default: () => 0 },
      share_code: { kind: "text" },
      created_at: { kind: "text", default: nowTimestamptz },
      clerk_user_id: { kind: "text", d1: "ownerId" },
      highlights: { kind: "textArray" },
      estimated_cost: { kind: "text" },
      subtitle: { kind: "text" },
      status: { kind: "text" },
      is_favorite: { kind: "bool", default: () => 0 },
      is_public: { kind: "bool", default: () => 0 },
      like_count: { kind: "int", default: () => 0 },
      view_count: { kind: "int", default: () => 0 },
      ai_backgrounds: { kind: "json" },
      story_slides: { kind: "json" },
    },
    // "Localley published itinerary read": authenticated users also see public itineraries.
    userReadAlso: "t.is_public = 1",
    // "Localley own itinerary" WITH CHECK: user_id is null or one of the caller's own profiles.
    userWriteCheck: (row) => row.user_id == null ? null
      : { sql: "SELECT 1 AS ok FROM profiles WHERE id = ? AND ownerId = ?", params: [String(row.user_id)] },
    beforeInsert: ensureOwner,
  },
  conversations: {
    table: "conversations",
    primaryKey: ["id"],
    owner: "clerk_user_id",
    columns: {
      id: { kind: "text", default: uuid },
      clerk_user_id: { kind: "text", d1: "ownerId" },
      title: { kind: "text" },
      created_at: { kind: "text", d1: "createdAt", default: nowTimestamptz },
      updated_at: { kind: "text", d1: "updatedAt", default: nowTimestamptz },
      linked_itinerary_id: { kind: "text", d1: "linkedItineraryId" },
    },
    // WITH CHECK: a linked itinerary must belong to the caller.
    userWriteCheck: (row) => row.linked_itinerary_id == null ? null
      : { sql: "SELECT 1 AS ok FROM itineraries WHERE id = ? AND ownerId = ?", params: [String(row.linked_itinerary_id)] },
    beforeInsert: ensureOwner,
  },
  messages: {
    table: "messages",
    primaryKey: ["id"],
    ownerExpr: "EXISTS (SELECT 1 FROM conversations c WHERE c.id = t.conversationId AND c.ownerId = ?)",
    columns: {
      id: { kind: "text", default: uuid },
      conversation_id: { kind: "text", d1: "conversationId" },
      role: { kind: "text" },
      content: { kind: "text" },
      created_at: { kind: "text", d1: "createdAt", default: nowTimestamptz },
    },
    // Checked when the row names its conversation (always on insert; on update only if the patch moves it).
    userWriteCheck: (row) => row.conversation_id === undefined ? null
      : { sql: "SELECT 1 AS ok FROM conversations WHERE id = ? AND ownerId = ?", params: [row.conversation_id === null ? null : String(row.conversation_id)] },
    // Trigger update_conversation_on_message: AFTER INSERT, conversations.updated_at = now().
    afterInsert: (row) => [{ sql: "UPDATE conversations SET updatedAt = ? WHERE id = ?", params: [nowTimestamptz(), row.conversation_id == null ? null : String(row.conversation_id)] }],
  },
  subscriptions: {
    table: "legacy_subscriptions",
    primaryKey: ["id"],
    owner: "clerk_user_id",
    userOps: ["select"],
    columns: {
      id: { kind: "text", default: uuid },
      clerk_user_id: { kind: "text", d1: "ownerId" },
      tier: { kind: "text" },
      status: { kind: "text" },
      stripe_customer_id: { kind: "text", d1: "stripeCustomerId" },
      stripe_subscription_id: { kind: "text", d1: "stripeSubscriptionId" },
      stripe_price_id: { kind: "text", d1: "stripePriceId" },
      billing_cycle: { kind: "text", d1: "billingCycle" },
      current_period_start: { kind: "text", d1: "currentPeriodStart" },
      current_period_end: { kind: "text", d1: "currentPeriodEnd" },
      cancel_at_period_end: { kind: "bool", d1: "cancelAtPeriodEnd" },
      trial_start: { kind: "text", d1: "trialStart" },
      trial_end: { kind: "text", d1: "trialEnd" },
      created_at: { kind: "text", d1: "createdAt", default: nowTimestamptz },
      updated_at: { kind: "text", d1: "updatedAt", default: nowTimestamptz },
    },
    beforeUpdate: touchUpdatedAt,
    beforeInsert: ensureOwner,
    checks: (row) =>
      row.tier !== undefined && !["free", "pro", "premium"].includes(String(row.tier)) ? "subscriptions_tier_check"
      : row.status !== undefined && !["active", "canceled", "past_due", "trialing"].includes(String(row.status)) ? "subscriptions_status_check"
      : row.billing_cycle != null && !["monthly", "yearly"].includes(String(row.billing_cycle)) ? "subscriptions_billing_cycle_check"
      : null,
  },
  usage_tracking: {
    table: "legacy_usage",
    primaryKey: ["id"],
    owner: "clerk_user_id",
    userOps: ["select"],
    columns: {
      id: { kind: "text", default: uuid },
      clerk_user_id: { kind: "text", d1: "ownerId" },
      usage_type: { kind: "text", d1: "usageType" },
      count: { kind: "int" },
      period_start: { kind: "text", d1: "periodStart" },
      period_type: { kind: "text", d1: "periodType" },
      created_at: { kind: "text", d1: "createdAt", default: nowTimestamptz },
      updated_at: { kind: "text", d1: "updatedAt", default: nowTimestamptz },
    },
    beforeUpdate: touchUpdatedAt,
    beforeInsert: ensureOwner,
    checks: (row) => usageCheck(row.usage_type, row.period_type),
  },
  users: {
    table: "profiles",
    primaryKey: ["id"],
    owner: "clerk_id",
    columns: {
      id: { kind: "text", default: uuid },
      clerk_id: { kind: "text", d1: "ownerId" },
      username: { kind: "text" },
      email: { kind: "text" },
      level: { kind: "int", default: () => 1 },
      xp: { kind: "int", default: () => 0 },
      title: { kind: "text", default: () => "Tourist" },
      created_at: { kind: "text", default: nowTimestamptz },
    },
    beforeInsert: (row) => ensureOwner({ clerk_user_id: row.clerk_id }),
  },
  saved_spots: {
    table: "saved_spots",
    primaryKey: ["id"],
    owner: "clerk_user_id",
    // Policies: SELECT / INSERT / DELETE own rows; no UPDATE policy.
    userOps: ["select", "insert", "delete"],
    columns: {
      id: { kind: "text", default: uuid },
      clerk_user_id: { kind: "text", d1: "ownerId" },
      spot_id: { kind: "text", d1: "spotId" },
      created_at: { kind: "text", default: nowTimestamptz },
    },
    d1Extra: (row) => ({ createdAtMs: row.created_at ? Date.parse(String(row.created_at)) : Date.now() }),
    beforeInsert: ensureOwner,
  },
  saved_itineraries: {
    table: "saved_itineraries",
    primaryKey: ["id"],
    owner: "clerk_user_id",
    userOps: ["select", "insert", "delete"],
    columns: {
      id: { kind: "text", default: uuid },
      clerk_user_id: { kind: "text" },
      itinerary_id: { kind: "text" },
      created_at: { kind: "text", default: nowTimestamptz },
    },
  },
};

/** Owner rows are the foreign-key parent of every owned table; a first write by a new user creates it. */
function ensureOwner(row: Row) {
  return [{ sql: "INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING", params: [String(row.clerk_user_id)] }];
}

/** usage_tracking_usage_type_check / usage_tracking_period_type_check (undefined = column not written). */
export function usageCheck(usageType: unknown, periodType: unknown): string | null {
  if (usageType !== undefined && !["itineraries_created", "chat_messages", "stories_created", "ai_images_generated", "spots_saved"].includes(String(usageType))) {
    return "usage_tracking_usage_type_check";
  }
  if (periodType !== undefined && !["daily", "weekly", "monthly"].includes(String(periodType))) return "usage_tracking_period_type_check";
  return null;
}

/** Trigger update_updated_at: BEFORE UPDATE, updated_at = now(). */
function touchUpdatedAt(patch: Row): Row {
  return { ...patch, updated_at: nowTimestamptz() };
}

/**
 * Supabase tables generated in migrations 0034 and 0038: columns from the generated catalog specs, policies from pg_policies
 * (2026-10-24). Without an entry here a table is service-key only, which is what Supabase does for the social_*,
 * apify_*, weekly_*, affiliate_* and contributor tables. Filtered public reads that the app never uses (geo_aliases,
 * geo_local_areas, geo_local_area_vibe_scores, transfer_edges) stay service-only: stricter, never wider.
 */
const PUBLIC_READ: Partial<TableSpec> = { anonRead: "1", userReadAlso: "1", userOps: ["select"] };
const VIA_PROFILE: Partial<TableSpec> = {
  ownerExpr: "t.user_id IN (SELECT id FROM profiles WHERE ownerId = ?)",
  userWriteCheck: (row) => row.user_id === undefined ? null
    : { sql: "SELECT 1 AS ok FROM profiles WHERE id = ? AND ownerId = ?", params: [row.user_id === null ? null : String(row.user_id)] },
};
const GENERATED_POLICIES: Record<string, Partial<TableSpec>> = {
  challenges: PUBLIC_READ,
  geo_countries: PUBLIC_READ,
  geo_vibe_taxonomy: PUBLIC_READ,
  geo_destinations: { anonRead: "t.is_enabled = 1", userReadAlso: "t.is_enabled = 1", userOps: ["select"] },
  // Postgres allows any INSERT/DELETE here (policies "true", 0 rows on 2026-10-24); D1 narrows writes to the
  // follower, which is the only write the app makes (app/api/friends).
  follows: { owner: "follower_id", anonRead: "1", userReadAlso: "1", userOps: ["select", "insert", "delete"] },
  user_challenges: VIA_PROFILE,
  user_progress: VIA_PROFILE,
  // Postgres: public SELECT/INSERT/UPDATE/DELETE "true" (0 rows on 2026-10-24); D1 narrows writes to the author.
  spot_reviews: { owner: "clerk_user_id", anonRead: "1", userReadAlso: "1" },
  review_helpful_votes: { owner: "clerk_user_id", anonRead: "1", userReadAlso: "1", userOps: ["select", "insert", "delete"] },
  guide_profiles: { owner: "clerk_user_id", userOps: ["select"] },
  guide_earnings: { owner: "guide_clerk_user_id", userOps: ["select"] },
};
/** Postgres triggers on the generated tables (pg_trigger 2026-10-24). */
const GENERATED_TRIGGERS: Record<string, Partial<TableSpec>> = {
  spot_contributors: { beforeUpdate: touchUpdatedAt },
  guide_profiles: { beforeUpdate: touchUpdatedAt },
  guide_earnings: { beforeUpdate: touchUpdatedAt },
  social_spot_submissions: {
    beforeUpdate: touchUpdatedAt,
    // reset_social_spot_media_finalization_attempts: a new media_processing_revision resets the finalization retry state.
    updateSql: (patch): Record<string, { sql: string; params: Binding[] }> => {
      if (patch.media_processing_revision === undefined) return {};
      const changed = "media_processing_revision IS NOT ?";
      const rev = patch.media_processing_revision === null ? null : Number(patch.media_processing_revision);
      const keep = (column: string) => patch[column] === undefined ? { sql: column, params: [] as Binding[] } : { sql: "?", params: [toD1Value(patch[column])] };
      const count = keep("media_finalization_attempt_count"), available = keep("media_finalization_available_at");
      return {
        media_finalization_attempt_count: { sql: `CASE WHEN ${changed} THEN 0 ELSE ${count.sql} END`, params: [rev, ...count.params] },
        media_finalization_available_at: { sql: `CASE WHEN ${changed} THEN NULL ELSE ${available.sql} END`, params: [rev, ...available.params] },
      };
    },
  },
};

for (const [table, generated] of Object.entries(GENERATED_SPECS)) {
  if (TABLES[table]) throw new Error(`D1 facade: ${table} is both hand-written and generated`);
  TABLES[table] = {
    table,
    primaryKey: generated.primaryKey,
    columns: Object.fromEntries(Object.entries(generated.columns).map(([name, c]) => [name, {
      kind: c.kind, ...(c.default === "uuid" ? { default: uuid } : c.default === "now" ? { default: nowTimestamptz } : {}),
    }])),
    ...(GENERATED_POLICIES[table] ?? { userOps: [] }),
    ...GENERATED_TRIGGERS[table],
  };
}

function spec(table: string): TableSpec {
  const found = TABLES[table];
  if (!found) throw new Error(`D1 facade: table ${table} is not migrated`);
  return found;
}

function column(s: TableSpec, name: string) {
  const col = s.columns[name];
  if (!col) throw new Error(`D1 facade: unknown column ${s.table}.${name}`);
  if (col.kind === "unsupported") throw new Error(`D1 facade: ${s.table}.${name} (geography/geometry) is not supported`);
  return { ...col, sql: `t.${col.d1 ?? name}` };
}

function toD1Value(value: unknown): Binding {
  return value === null || value === undefined ? null : typeof value === "number" || typeof value === "string" ? value : JSON.stringify(value);
}

function toD1(kind: Kind, value: unknown): Binding {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "bool":
      if (typeof value !== "boolean" && value !== 0 && value !== 1) throw new Error("D1 facade: boolean expected");
      return value === true || value === 1 ? 1 : 0;
    case "json": return JSON.stringify(value);
    case "textArray":
      if (!Array.isArray(value)) throw new Error("D1 facade: array expected");
      return JSON.stringify(value);
    case "int": case "real":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("D1 facade: number expected");
      return value;
    default:
      if (typeof value !== "string") throw new Error("D1 facade: text expected");
      return value;
  }
}

function fromD1(kind: Kind, value: unknown): Value {
  if (value === null || value === undefined) return null;
  if (kind === "bool") return value === 1;
  if (kind === "json" || kind === "textArray") return JSON.parse(String(value));
  return value as Value;
}

function parseSelect(s: TableSpec, columns: string): string[] {
  const names = columns.split(",").map((c) => c.trim()).filter(Boolean);
  if (names.length === 0) throw new Error("D1 facade: empty select");
  if (names.length === 1 && names[0] === "*") {
    const all = Object.keys(s.columns);
    for (const name of all) column(s, name);
    return all;
  }
  for (const name of names) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`D1 facade: unsupported select item "${name}" (embeds and aliases are not supported)`);
    column(s, name);
  }
  return names;
}

type Filter = { sql: string; params: Binding[] };

class D1Query<T = Row[]> implements PromiseLike<PostgrestResult<T>> {
  private action: Action = "select";
  private selected: string[] | null = null;
  private countMode: "exact" | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitCount: number | null = null;
  private offsetCount = 0;
  private cardinality: "many" | "single" | "maybeSingle" = "many";
  private values: Row[] = [];
  private patch: Row = {};
  private conflict: { columns: string[]; ignore: boolean } | null = null;

  constructor(private db: PreviewAppDataReader, private s: TableSpec, private auth: D1Role) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    if (options && Object.keys(options).some((k) => k !== "count" && k !== "head")) throw new Error("D1 facade: unsupported select option");
    if (options?.count && options.count !== "exact") throw new Error("D1 facade: only count exact");
    this.selected = parseSelect(this.s, columns);
    this.countMode = options?.count ?? null;
    this.head = options?.head === true;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.action = "insert";
    this.values = Array.isArray(rows) ? rows : [rows];
    for (const row of this.values) for (const key of Object.keys(row)) column(this.s, key);
    return this;
  }

  /** PostgREST upsert: ON CONFLICT (onConflict, default primary key) DO UPDATE the payload columns, or DO NOTHING. */
  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    if (options && Object.keys(options).some((k) => k !== "onConflict" && k !== "ignoreDuplicates")) throw new Error("D1 facade: unsupported upsert option");
    this.insert(rows);
    this.conflict = { columns: options?.onConflict ? options.onConflict.split(",").map((c) => c.trim()) : this.s.primaryKey, ignore: options?.ignoreDuplicates === true };
    for (const c of this.conflict.columns) column(this.s, c);
    return this;
  }

  update(patch: Row) {
    this.action = "update";
    for (const key of Object.keys(patch)) column(this.s, key);
    this.patch = patch;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  private compare(name: string, op: string, value: unknown) {
    const col = column(this.s, name);
    if (value === null) throw new Error("D1 facade: use is() for null");
    this.filters.push({ sql: `${col.sql} ${op} ?`, params: [toD1(col.kind === "json" || col.kind === "textArray" ? "text" : col.kind, value)] });
    return this;
  }

  eq(name: string, value: unknown) { return this.compare(name, "=", value); }
  neq(name: string, value: unknown) { return this.compare(name, "!=", value); }
  gt(name: string, value: unknown) { return this.compare(name, ">", value); }
  gte(name: string, value: unknown) { return this.compare(name, ">=", value); }
  lt(name: string, value: unknown) { return this.compare(name, "<", value); }
  lte(name: string, value: unknown) { return this.compare(name, "<=", value); }

  in(name: string, values: unknown[]) {
    const col = column(this.s, name);
    if (!Array.isArray(values)) throw new Error("D1 facade: in() needs an array");
    this.filters.push({ sql: `${col.sql} IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(values.map((v) => toD1(col.kind, v)))] });
    return this;
  }

  is(name: string, value: null) {
    if (value !== null) throw new Error("D1 facade: is() supports null only");
    this.filters.push({ sql: `${column(this.s, name).sql} IS NULL`, params: [] });
    return this;
  }

  not(name: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error(`D1 facade: unsupported not(${operator})`);
    this.filters.push({ sql: `${column(this.s, name).sql} IS NOT NULL`, params: [] });
    return this;
  }

  order(name: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const ascending = options?.ascending ?? true;
    // Postgres default: ASC puts NULLs last, DESC puts them first.
    const nullsFirst = options?.nullsFirst ?? !ascending;
    this.orders.push(`${column(this.s, name).sql} ${ascending ? "ASC" : "DESC"} NULLS ${nullsFirst ? "FIRST" : "LAST"}`);
    return this;
  }

  limit(count: number) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("D1 facade: bad limit");
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) throw new Error("D1 facade: bad range");
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single() { this.cardinality = "single"; return this as unknown as D1Query<Row>; }
  maybeSingle() { this.cardinality = "maybeSingle"; return this as unknown as D1Query<Row | null>; }
  abortSignal() { return this; }

  then<R1 = PostgrestResult<T>, R2 = never>(
    onfulfilled?: ((value: PostgrestResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  /** Visibility for the caller's role: SELECT/UPDATE/DELETE rows outside it do not exist for them. */
  private policy(op: Action): Filter | null {
    const forRead = op === "select";
    if (this.auth.role === "service") return null;
    if (this.auth.role === "anon") return { sql: forRead && this.s.anonRead ? `(${this.s.anonRead})` : "0", params: [] };
    if (this.s.userOps && !this.s.userOps.includes(op)) return { sql: "0", params: [] };
    const owner = this.s.ownerExpr ?? (this.s.owner ? `${column(this.s, this.s.owner).sql} = ?` : null);
    if (!owner) return { sql: forRead && this.s.userReadAlso ? `(${this.s.userReadAlso})` : "0", params: [] };
    if (forRead && this.s.userReadAlso) return { sql: `(${owner} OR ${this.s.userReadAlso})`, params: [this.auth.userId] };
    return { sql: `(${owner})`, params: [this.auth.userId] };
  }

  private where(op: Action): Filter {
    const parts = [...this.filters];
    const policy = this.policy(op);
    if (policy) parts.push(policy);
    return parts.length
      ? { sql: ` WHERE ${parts.map((p) => p.sql).join(" AND ")}`, params: parts.flatMap((p) => p.params) }
      : { sql: "", params: [] };
  }

  private decode(row: Record<string, unknown>, names: string[]): Row {
    return Object.fromEntries(names.map((name) => [name, fromD1(this.s.columns[name].kind, row[name])]));
  }

  private projection(names: string[]) {
    return names.map((name) => `${column(this.s, name).sql} AS ${name}`).join(", ");
  }

  private shape(rows: Row[], count: number | null): PostgrestResult<T> {
    if (this.cardinality === "many") return { data: (this.selected || this.action === "select" ? rows : null) as T, error: null, count, status: 200 };
    if (rows.length === 1) return { data: rows[0] as T, error: null, count, status: 200 };
    if (rows.length === 0 && this.cardinality === "maybeSingle") return { data: null, error: null, count, status: 200 };
    const e = error("PGRST116", `JSON object requested, multiple (or no) rows returned`, 406);
    return { data: null, error: e, count: null, status: e.status };
  }

  private async execute(): Promise<PostgrestResult<T>> {
    try {
      switch (this.action) {
        case "select": return await this.runSelect();
        case "insert": return await this.runInsert();
        case "update": return await this.runUpdate();
        default: return await this.runDelete();
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.startsWith("D1 facade:")) throw cause;
      if (/UNIQUE constraint failed/i.test(message)) return { data: null, error: error("23505", message, 409), count: null, status: 409 };
      if (/FOREIGN KEY constraint failed/i.test(message)) return { data: null, error: error("23503", message, 409), count: null, status: 409 };
      if (/CHECK constraint failed|NOT NULL constraint failed/i.test(message)) return { data: null, error: error("23514", message), count: null, status: 400 };
      throw cause;
    }
  }

  private async runSelect(): Promise<PostgrestResult<T>> {
    const names = this.selected ?? Object.keys(this.s.columns);
    const where = this.where("select");
    let count: number | null = null;
    if (this.countMode) {
      const row = await this.db.prepare(`SELECT count(*) AS n FROM ${this.s.table} t${where.sql}`).bind(...where.params).first<{ n: number }>();
      count = row?.n ?? 0;
      if (this.head) return { data: null, error: null, count, status: 200 };
    }
    const order = this.orders.length ? ` ORDER BY ${this.orders.join(", ")}` : "";
    const limit = this.limitCount !== null ? ` LIMIT ${this.limitCount} OFFSET ${this.offsetCount}` : this.offsetCount ? ` LIMIT -1 OFFSET ${this.offsetCount}` : "";
    const { results } = await this.db.prepare(`SELECT ${this.projection(names)} FROM ${this.s.table} t${where.sql}${order}${limit}`)
      .bind(...where.params).all<Record<string, unknown>>();
    return this.shape(results.map((r) => this.decode(r, names)), count);
  }

  private async runInsert(): Promise<PostgrestResult<T>> {
    if (this.filters.length || this.orders.length) throw new Error("D1 facade: filters on insert");
    const statements: PreviewAppDataStatement[] = [];
    const keys: Binding[][] = [];
    for (const input of this.values) {
      const row: Row = { ...input };
      for (const [name, col] of Object.entries(this.s.columns)) if (row[name] === undefined && col.default) row[name] = col.default();
      if (this.auth.role === "anon") return this.rlsInsertError();
      if (this.auth.role === "user") {
        if (this.s.userOps && !this.s.userOps.includes("insert")) return this.rlsInsertError();
        if (this.s.owner ? row[this.s.owner] !== this.auth.userId : !this.s.ownerExpr) return this.rlsInsertError();
        if (!(await this.passesWriteCheck(row))) return this.rlsInsertError();
      }
      const violated = this.s.checks?.(row);
      if (violated) return this.checkError(violated);
      for (const before of this.s.beforeInsert?.(row) ?? []) statements.push(this.db.prepare(before.sql).bind(...before.params));
      const names = Object.keys(row).filter((name) => row[name] !== undefined);
      const extra = Object.entries(this.s.d1Extra?.(row) ?? {});
      const d1 = (n: string) => this.s.columns[n].d1 ?? n;
      let onConflict = "";
      const updateParams: Binding[] = [];
      if (this.conflict) {
        const target = this.conflict.columns.map(d1).join(", ");
        // Only the caller's payload columns change on conflict; defaults (id, created_at) never overwrite stored values.
        const payload = Object.keys(input).filter((n) => input[n] !== undefined && !this.conflict!.columns.includes(n));
        const touched = this.s.beforeUpdate ? this.s.beforeUpdate(Object.fromEntries(payload.map((n) => [n, input[n]]))) : Object.fromEntries(payload.map((n) => [n, input[n]]));
        const sets = Object.keys(touched).map((n) => `${d1(n)} = ?`);
        updateParams.push(...Object.keys(touched).map((n) => toD1(this.s.columns[n].kind, touched[n])));
        const ownerGuard = this.auth.role === "user" && this.s.owner ? ` WHERE ${d1(this.s.owner)} = ?` : "";
        if (ownerGuard) updateParams.push(this.auth.role === "user" ? this.auth.userId : null);
        onConflict = this.conflict.ignore || !sets.length ? ` ON CONFLICT (${target}) DO NOTHING` : ` ON CONFLICT (${target}) DO UPDATE SET ${sets.join(", ")}${ownerGuard}`;
        if (this.conflict.ignore || !sets.length) updateParams.length = 0;
      }
      statements.push(this.db.prepare(`INSERT INTO ${this.s.table} (${[...names.map(d1), ...extra.map(([c]) => c)].join(", ")}) VALUES (${[...names, ...extra].map(() => "?").join(", ")})${onConflict}`)
        .bind(...names.map((n) => toD1(this.s.columns[n].kind, row[n])), ...extra.map(([, v]) => v), ...updateParams));
      for (const after of this.s.afterInsert?.(row) ?? []) statements.push(this.db.prepare(after.sql).bind(...after.params));
      const keyColumns = this.conflict ? this.conflict.columns : this.s.primaryKey;
      keys.push(keyColumns.map((k) => toD1(this.s.columns[k].kind, row[k])));
    }
    await this.db.batch(statements);
    if (!this.selected) return { data: null, error: null, count: null, status: 201 };
    const rows: Row[] = [];
    for (const key of keys) {
      const match = (this.conflict ? this.conflict.columns : this.s.primaryKey).map((k) => `${column(this.s, k).sql} = ?`).join(" AND ");
      const row = await this.db.prepare(`SELECT ${this.projection(this.selected)} FROM ${this.s.table} t WHERE ${match}`).bind(...key).first<Record<string, unknown>>();
      if (row) rows.push(this.decode(row, this.selected));
    }
    return this.shape(rows, null);
  }

  private async passesWriteCheck(row: Row): Promise<boolean> {
    if (this.auth.role !== "user") return true;
    const check = this.s.userWriteCheck?.(row);
    return !check || Boolean(await this.db.prepare(check.sql).bind(...check.params, this.auth.userId).first());
  }

  private checkError(constraint: string): PostgrestResult<T> {
    const e = error("23514", `new row for relation "${this.s.table}" violates check constraint "${constraint}"`);
    return { data: null, error: e, count: null, status: e.status };
  }

  private rlsInsertError(): PostgrestResult<T> {
    const e = error("42501", `new row violates row-level security policy for table "${this.s.table}"`, 403);
    return { data: null, error: e, count: null, status: e.status };
  }

  /** Primary keys of the rows the caller may change, captured before the write so .select() can return them. */
  private async targetKeys(): Promise<Binding[][]> {
    const where = this.where(this.action);
    const { results } = await this.db.prepare(`SELECT ${this.s.primaryKey.map((k) => `${column(this.s, k).sql} AS ${k}`).join(", ")} FROM ${this.s.table} t${where.sql}`)
      .bind(...where.params).all<Record<string, Binding>>();
    return results.map((r) => this.s.primaryKey.map((k) => r[k]));
  }

  private keyMatch(keys: Binding[][], alias = ""): Filter {
    const cols = this.s.primaryKey.map((k) => `${alias}${this.s.columns[k].d1 ?? k}`).join(", ");
    return { sql: `json_array(${cols}) IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(keys)] };
  }

  private async runUpdate(): Promise<PostgrestResult<T>> {
    if (this.auth.role === "anon") return { data: this.selected ? [] as T : null, error: null, count: null, status: 200 };
    if (!Object.keys(this.patch).length) throw new Error("D1 facade: empty update");
    const patch = this.s.beforeUpdate ? this.s.beforeUpdate(this.patch) : this.patch;
    const names = Object.keys(patch);
    if (this.auth.role === "user" && this.s.owner && names.includes(this.s.owner) && patch[this.s.owner] !== this.auth.userId) {
      return this.rlsInsertError();
    }
    if (this.auth.role === "user" && !(await this.passesWriteCheck(patch))) return this.rlsInsertError();
    const violated = this.s.checks?.(patch);
    if (violated) return this.checkError(violated);
    const keys = await this.targetKeys();
    if (keys.length) {
      const match = this.keyMatch(keys);
      const overrides = this.s.updateSql?.(patch) ?? {};
      const plain = names.filter((n) => !(n in overrides));
      const sets = [...plain.map((n) => `${this.s.columns[n].d1 ?? n} = ?`), ...Object.entries(overrides).map(([n, o]) => `${this.s.columns[n].d1 ?? n} = ${o.sql}`)];
      await this.db.prepare(`UPDATE ${this.s.table} SET ${sets.join(", ")} WHERE ${match.sql}`)
        .bind(...plain.map((n) => toD1(this.s.columns[n].kind, patch[n])), ...Object.values(overrides).flatMap((o) => o.params), ...match.params).run();
    }
    return this.returnKeys(keys);
  }

  private async runDelete(): Promise<PostgrestResult<T>> {
    if (this.auth.role === "anon") return { data: this.selected ? [] as T : null, error: null, count: null, status: 200 };
    const keys = await this.targetKeys();
    const before = this.selected && keys.length ? await this.rowsFor(keys) : [];
    if (keys.length) {
      const match = this.keyMatch(keys);
      await this.db.prepare(`DELETE FROM ${this.s.table} WHERE ${match.sql}`).bind(...match.params).run();
    }
    return this.shape(before, null);
  }

  private async rowsFor(keys: Binding[][]): Promise<Row[]> {
    const names = this.selected!;
    const match = this.keyMatch(keys, "t.");
    const { results } = await this.db.prepare(`SELECT ${this.projection(names)} FROM ${this.s.table} t WHERE ${match.sql}`)
      .bind(...match.params).all<Record<string, unknown>>();
    return results.map((r) => this.decode(r, names));
  }

  private async returnKeys(keys: Binding[][]): Promise<PostgrestResult<T>> {
    if (!this.selected) return { data: null, error: null, count: null, status: 204 };
    return this.shape(keys.length ? await this.rowsFor(keys) : [], null);
  }
}

/** Supabase-client-shaped entry point: `d1Client(db, auth).from("itineraries").select(...)`. */
export function d1Client(db: PreviewAppDataReader, auth: D1Role) {
  if (auth.role === "user" && (typeof auth.userId !== "string" || !auth.userId)) throw new Error("D1 facade: user role needs a user id");
  return { from: (table: string) => new D1Query(db, spec(table), auth) };
}
