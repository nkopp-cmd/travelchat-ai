const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

export function extractSocialUrl(value: string | null): string {
  if (!value) return "";
  const candidates = value.match(/https?:\/\/[^\s"'<>]+/gi) || [value];

  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.trim().replace(/[),.!?;:]+$/g, "");
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port &&
        (INSTAGRAM_HOSTS.has(host) || TIKTOK_HOSTS.has(host))
      ) return candidate;
    } catch {
      // Continue to the next URL in shared text.
    }
  }
  return "";
}
