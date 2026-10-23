// Static public pages (/, /pricing, /itineraries/new) are Workers static assets, so the
// middleware apex -> www 301 never runs for them. Until a zone redirect rule exists, this
// inline head script sends apex visitors to the canonical www host before anything loads:
// one host keeps one Better Auth cookie, and form POSTs never hit the middleware 301.
export const CANONICAL_HOST = "www.localley.io";
export const APEX_HOST = "localley.io";

export const APEX_REDIRECT_SCRIPT =
    `if(location.hostname==="${APEX_HOST}")location.replace("https://${CANONICAL_HOST}"+location.pathname+location.search+location.hash)`;
