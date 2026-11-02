import { dataBackend } from "./backend";

/** True when app data can be read: D1 (no Supabase secrets needed since exit 8b) or a Supabase service key (the pre-8b check). */
export function appDataConfigured(): boolean {
  return dataBackend() === "d1" || Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
