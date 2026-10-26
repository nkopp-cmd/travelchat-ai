import "server-only";
import type { PreviewAppDataReader } from "./preview-db";

export type Args = Record<string, unknown>;

/** plpgsql RAISE EXCEPTION -> PostgREST error with the message and its SQLSTATE (P0001 unless the function sets one). */
export class RaiseException extends Error {
  constructor(message: string, readonly code = "P0001") { super(message); }
}

/** Gate 2 write journal entry (replay syncs the Supabase rows matching `key` to the D1 rows matching it). */
export function journal(db: PreviewAppDataReader, table: string, op: "upsert" | "delete", key: Record<string, string | number | null>) {
  return db.prepare("INSERT INTO _journal (table_name, op, pk) VALUES (?, ?, ?)").bind(table, op, JSON.stringify(key));
}

export function text(args: Args, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value) throw new Error(`D1 rpc: ${name} must be text`);
  return value;
}

export function integer(args: Args, name: string, fallback?: number): number {
  const value = args[name] ?? fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`D1 rpc: ${name} must be an integer`);
  return value;
}
