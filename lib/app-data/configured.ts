import { dataBackend } from "./backend";

/** True when app data can be read: D1 (no Supabase secrets needed since exit 8b) or a Supabase service key. */
export function appDataConfigured(): boolean {
  return dataBackend() === "d1" || Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
