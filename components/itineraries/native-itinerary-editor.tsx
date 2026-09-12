"use client";

import { useEffect, useRef, useState } from "react";
import { useAppSession } from "@/providers/app-session-provider";
import { isItinerarySnapshot, type PlanningSpot } from "@/lib/itineraries/spot-planning";
import { ItineraryAccessError, ItineraryEditor, type EditorItinerary } from "./itinerary-editor";
import { boundedFetch, EDITOR_RESPONSE_MAX_BYTES } from "@/lib/auth/bounded-fetch";
import { isEditableItineraryPlan } from "@/lib/itineraries/plan-contract";

export interface NativeItineraryEditorProps {
    id: string;
    planningSpot?: PlanningSpot | null;
    onNavigate?: (path: string) => void;
}

/** GET returns the decoded row directly, not a Next/Supabase response envelope. */
export interface NativeItineraryDTO extends EditorItinerary {
    ownerId: string;
}

function isNativeItinerary(value: unknown, id: string, ownerId: string): value is NativeItineraryDTO {
    if (!isItinerarySnapshot(value)) return false;
    const row = value as unknown as Record<string, unknown>;
    if (row.id !== id || row.ownerId !== ownerId || typeof row.title !== "string" || typeof row.city !== "string"
        || typeof row.days !== "number" || !Number.isSafeInteger(row.days) || row.days < 1) return false;
    return isEditableItineraryPlan(row.activities);
}

export function NativeItineraryEditor(props: NativeItineraryEditorProps) {
    const session = useAppSession();
    if (session.status === "loading") return <p role="status">Checking your account...</p>;
    if (session.provider !== "better-auth" || session.status !== "ready" || !session.accountKey || !session.ownerId || !session.sessionId) {
        return <p role="alert">This editor is not available for this account.</p>;
    }
    // A new identity gets a new loader and editor, never the previous owner's draft.
    return <OwnedNativeEditor {...props} id={props.id.toLowerCase()} key={JSON.stringify([props.id.toLowerCase(), session.accountKey, session.ownerId, session.sessionId, session.authUserId, session.userRecordId])}
        ownerId={session.ownerId} sessionId={session.sessionId} />;
}

function OwnedNativeEditor({ id, planningSpot, onNavigate, ownerId, sessionId }: NativeItineraryEditorProps & { ownerId: string; sessionId: string }) {
    const { refresh } = useAppSession();
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;
    const [state, setState] = useState<NativeItineraryDTO | string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const lifetime = useRef<AbortController | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        void (async () => {
            try {
                const response = await boundedFetch(`/api/itineraries/${encodeURIComponent(id)}`, {
                    credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
                    headers: { "x-localley-session-id": sessionId },
                }, EDITOR_RESPONSE_MAX_BYTES);
                if (controller.signal.aborted) return;
                if (!response.ok) {
                    if ([401, 403, 409].includes(response.status)) {
                        const fault = await response.clone().json().catch(() => null);
                        if (controller.signal.aborted) return;
                        if (response.status !== 409 || fault?.error?.code === "session_changed") void refreshRef.current().catch(() => {});
                    }
                    throw new Error(response.status === 404 ? "This itinerary is not available." : "Could not load this itinerary. Access may have changed.");
                }
                const row: unknown = await response.json();
                if (controller.signal.aborted) return;
                if (!isNativeItinerary(row, id, ownerId)) throw new Error("This itinerary is not available or its data is invalid.");
                setState(row);
            } catch (error) {
                if (!controller.signal.aborted) setState(error instanceof Error ? error.message : "Could not load this itinerary.");
            }
        })();
        return () => { controller.abort(); };
    }, [id, ownerId, sessionId, attempt]);

    if (state === null) return <p role="status">Loading itinerary...</p>;
    if (typeof state === "string") return <div><p role="alert">{state}</p><button onClick={() => { setState(null); setAttempt((value) => value + 1); }}>Retry loading itinerary</button></div>;
    return <ItineraryEditor itinerary={state} planningSpot={planningSpot}
        onNavigate={onNavigate ?? ((path) => {
            window.location.assign(path);
        })}
        saveRequest={async (payload, signal) => {
            const scopeSignal = lifetime.current?.signal;
            if (!scopeSignal || scopeSignal.aborted || signal?.aborted) throw new DOMException("Editor closed", "AbortError");
            const response = await boundedFetch(`/api/itineraries/${encodeURIComponent(id)}/update`, {
                method: "PATCH", credentials: "same-origin", redirect: "error",
                headers: { "Content-Type": "application/json", "x-localley-session-id": sessionId },
                body: JSON.stringify(payload), signal: signal ? AbortSignal.any([scopeSignal, signal]) : scopeSignal,
            }, EDITOR_RESPONSE_MAX_BYTES).catch((error: unknown) => {
                if (scopeSignal.aborted || signal?.aborted) throw error;
                throw new Error("We could not confirm the save. It may have reached the server. Check the saved version before trying again.");
            });
            if (scopeSignal.aborted || signal?.aborted) return response;
            if ([401, 403, 409].includes(response.status)) {
                const fault = await response.clone().json().catch(() => null);
                // Snapshot conflicts must keep the mounted draft. Only identity faults refresh it.
                if (!scopeSignal.aborted && !signal?.aborted && (response.status !== 409 || fault?.error?.code === "session_changed")) {
                    const message = "The editor closed because access could not be confirmed. This draft was not saved.";
                    setState(message);
                    await refreshRef.current().catch(() => {});
                    throw new ItineraryAccessError(message);
                }
            }
            return response;
        }} />;
}
