import { useLayoutEffect, useRef, useState } from "react";
import { BetterAuthSessionProvider } from "@/providers/better-auth-session-provider";
import { useAppSession } from "@/providers/app-session-provider";
import { NativeItineraryCollection } from "@/components/itineraries/native-itinerary-collection";
import { NativeItineraryEditor } from "@/components/itineraries/native-itinerary-editor";
import { refreshContext } from "./session";

type ExpectedIdentity = { authUserId: string; sessionId: string; ownerId: string; userRecordId: string };

export function TripsPane({ expected, onSignIn }: { expected: ExpectedIdentity; onSignIn: () => void }) {
  return <BetterAuthSessionProvider onSignIn={onSignIn}>
    <VerifiedTrips expected={expected} />
  </BetterAuthSessionProvider>;
}

function VerifiedTrips({ expected }: { expected: ExpectedIdentity }) {
  const session = useAppSession();
  const [activeId, setActiveId] = useState<string | null>(null);
  const closing = useRef(false);
  const matches = session.provider === "better-auth" && session.status === "ready"
    && !!session.accountKey && session.authUserId === expected.authUserId
    && session.sessionId === expected.sessionId && session.ownerId === expected.ownerId
    && session.userRecordId === expected.userRecordId;
  useLayoutEffect(() => {
    // Loading is normal during provider verification, not an identity mismatch.
    if (session.status !== "loading" && session.status !== "blocked" && !matches && !closing.current) {
      closing.current = true;
      void refreshContext();
    }
  }, [matches, session.status]);
  // A failed check is not an observed replacement identity. Retry in place, without remount loops.
  if (session.status === "blocked") return <div role="alert"><p>Trip access could not be confirmed. Trips remain hidden.</p>
    <button className="secondary" onClick={() => void session.refresh()}>Retry trip access</button></div>;
  if (!matches || closing.current) return <p role="status">Checking your trip account...</p>;
  return <div className="native-trips">
    {activeId ? <NativeItineraryEditor id={activeId} onNavigate={() => setActiveId(null)} />
      : <NativeItineraryCollection onNavigate={(path) => {
        const match = /^\/itineraries\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(path);
        if (match) setActiveId(match[1].toLowerCase());
      }} onDeleted={() => setActiveId(null)} />}
  </div>;
}
