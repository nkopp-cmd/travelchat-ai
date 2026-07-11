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

export function getCanonicalSocialPostPath(hostname: string, pathname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const segments = pathname.split("/").filter(Boolean);

  if (INSTAGRAM_HOSTS.has(host)) {
    const [kind, id] = segments;
    if (kind === "share") {
      const shareSegments = segments.slice(1);
      if (
        shareSegments.length >= 1 &&
        shareSegments.length <= 2 &&
        shareSegments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))
      ) {
        return `/share/${shareSegments.join("/")}`;
      }
      return null;
    }
    if (!id || !["p", "reel", "reels", "tv"].includes(kind || "")) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return `/${kind === "reels" ? "reel" : kind}/${id}`;
  }

  if (!TIKTOK_HOSTS.has(host)) return null;
  if (["vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
    const [id] = segments;
    return id && /^[A-Za-z0-9_-]+$/.test(id) ? `/${id}` : null;
  }

  if (
    segments.length >= 3 &&
    segments[0].startsWith("@") &&
    ["video", "photo"].includes(segments[1]) &&
    /^\d+$/.test(segments[2])
  ) {
    return `/${segments[0]}/${segments[1]}/${segments[2]}`;
  }
  if (segments[0] === "t" && segments[1] && /^[A-Za-z0-9_-]+$/.test(segments[1])) {
    return `/t/${segments[1]}`;
  }
  if (segments[0] === "v" && segments[1] && /^\d+(?:\.html)?$/.test(segments[1])) {
    return `/v/${segments[1]}`;
  }
  return null;
}

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
        (INSTAGRAM_HOSTS.has(host) || TIKTOK_HOSTS.has(host)) &&
        getCanonicalSocialPostPath(host, parsed.pathname)
      ) return candidate;
    } catch {
      // Continue to the next URL in shared text.
    }
  }
  return "";
}
