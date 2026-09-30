/** Carry the explicit preview opt-in through all review actions. */
export function reviewCandidateSuffix(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname === "localley-next-preview.nkopp.workers.dev"
    && new URLSearchParams(window.location.search).get("data_candidate") === "d1"
    ? "data_candidate=d1" : "";
}
