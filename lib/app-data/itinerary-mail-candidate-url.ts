/** Client opt-in only; the route independently verifies session, recipient and ownership. */
export function itineraryMailCandidateUrl(id: string, location: Pick<Location, "hostname" | "search"> | undefined =
  typeof window === "undefined" ? undefined : window.location): string | null {
  if (location?.hostname !== "localley-next-preview.nkopp.workers.dev"
    || new URLSearchParams(location.search).get("data_candidate") !== "d1"
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  return `/api/itineraries/${id.toLowerCase()}/email?data_candidate=d1`;
}
