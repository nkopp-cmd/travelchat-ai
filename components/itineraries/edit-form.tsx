"use client";

import { useRouter } from "next/navigation";
import { useAppSession } from "@/providers/app-session-provider";
import { ItineraryEditor, type ItineraryEditorProps } from "./itinerary-editor";

export type EditFormProps = Pick<ItineraryEditorProps, "planningSpot" | "spotNotice"> & {
    itinerary: ItineraryEditorProps["itinerary"] & { clerk_user_id?: string | null };
};

/** The production Next page remains on Clerk; native hosts use NativeItineraryEditor directly. */
export function EditForm({ itinerary, ...props }: EditFormProps) {
    const router = useRouter();
    const session = useAppSession();
    if (session.status === "loading") return <p role="status">Checking your account...</p>;
    if (session.provider !== "clerk" || session.status !== "ready" || !session.ownerId || !session.accountKey
        || itinerary.clerk_user_id !== session.ownerId) {
        return <p role="alert">This itinerary is not available for this account.</p>;
    }
    return <ItineraryEditor {...props} itinerary={itinerary}
        key={JSON.stringify([itinerary.id, session.accountKey, session.ownerId, session.sessionId, session.authUserId, session.userRecordId])}
        onNavigate={(path) => router.push(path)}
        saveRequest={(payload, signal) => fetch(`/api/itineraries/${encodeURIComponent(itinerary.id)}/update`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload), signal,
        })} />;
}
