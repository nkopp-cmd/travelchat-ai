// Only the reserved diagnostic dashboard probes may enter a provider URL lookup.
// URLSearchParams encodes literal tildes returned by Next's RSC307 redirect.
export function normalizeRscProbeUrl(value) {
  try {
    if (typeof value !== 'string') throw Error();
    const url = new URL(value);
    if (url.origin !== 'https://www.localley.io' || url.pathname !== '/dashboard'
        || url.username || url.password || url.hash
        || [...url.searchParams.keys()].sort().join(',') !== '_rsc,transportCanary'
        || !/^[0-9a-f]{8}~[0-9a-f]{4}~[0-9a-f]{4}~[0-9a-f]{4}~[0-9a-f]{12}$/.test(url.searchParams.get('transportCanary') || '')
        || !/^[A-Za-z0-9_-]{0,64}$/.test(url.searchParams.get('_rsc') || '')) throw Error();
    url.search = url.searchParams.toString();
    return url.href;
  } catch { throw Error('Invalid retained RSC probe'); }
}
