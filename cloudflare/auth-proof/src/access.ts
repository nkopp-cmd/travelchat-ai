import { createRemoteJWKSet, jwtVerify } from "jose";
import { allowedEmail } from "./runtime";

export type AccessIdentity = { kind: "human"; email: string } | { kind: "service" };
// Only key discovery configuration is shared. Identities remain request-local.
let keyConfig: { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

export async function verifyAccess(request: Request, env: PreviewEnv): Promise<AccessIdentity | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 16384) return null;
  try {
    const issuer = env.ACCESS_TEAM_DOMAIN;
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !/^[a-f0-9]{64}$/.test(env.ACCESS_AUD)) return null;
    if (keyConfig?.issuer !== issuer) keyConfig = { issuer, keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) };
    const { payload } = await jwtVerify(token, keyConfig.keys, {
      issuer, audience: env.ACCESS_AUD, algorithms: ["RS256"], requiredClaims: ["exp", "iat"],
    });
    if (payload.common_name !== undefined) {
      return env.ACCESS_SERVICE_CLIENT_CN && payload.common_name === env.ACCESS_SERVICE_CLIENT_CN
        && ["GET", "HEAD"].includes(request.method) ? { kind: "service" } : null;
    }
    const email = allowedEmail(env, payload.email);
    return email ? { kind: "human", email } : null;
  } catch { return null; }
}
