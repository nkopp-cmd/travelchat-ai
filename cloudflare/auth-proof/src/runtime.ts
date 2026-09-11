import { isIP } from "node:net";

export type RuntimeEnv = Env | PreviewEnv;
export const PREVIEW_ORIGIN = "https://preview.localley.io";

export function isPreview(env: RuntimeEnv): env is PreviewEnv {
  return env.APP_MODE === "preview";
}

export function allowedEmail(env: PreviewEnv, value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  const email = value.toLowerCase();
  const list = env.PREVIEW_ALLOWED_EMAILS;
  if (!list || list.length > 4096) return null;
  return list.split(",").map(item => item.trim().toLowerCase()).includes(email) ? email : null;
}

export async function validRuntime(request: Request, env: RuntimeEnv): Promise<boolean> {
  const base = new URL(env.AUTH_BASE_URL);
  if (new URL(request.url).origin !== base.origin || base.origin !== env.AUTH_BASE_URL
    || base.protocol !== "https:" || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) return false;
  if (isPreview(env)) {
    if (env.AUTH_BASE_URL !== PREVIEW_ORIGIN || !env.NATIVE_EMAIL || !env.PREVIEW_ALLOWED_EMAILS
      || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)
      || !/^[a-f0-9]{64}$/.test(env.ACCESS_AUD)) return false;
    const marker = await env.DB.prepare("SELECT purpose FROM runtime_purpose WHERE id = 1").first<{ purpose: string }>();
    return marker?.purpose === "localley-preview";
  }
  return (env.APP_MODE === undefined || env.APP_MODE === "local") && env.LOCAL_PROOF === "true"
    && (base.hostname === "localhost" || base.hostname.endsWith(".test")) && env.CLAIM_SECRET?.length >= 32;
}

export function trustedIP(request: Request, env: RuntimeEnv): string | null {
  if (!isPreview(env)) return "127.0.0.1";
  const ip = request.headers.get("cf-connecting-ip");
  return ip && ip.length <= 45 && isIP(ip) ? ip : null;
}
