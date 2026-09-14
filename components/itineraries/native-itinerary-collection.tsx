"use client";

import { useEffect, useRef, useState } from "react";
import { useAppSession } from "@/providers/app-session-provider";
import { Button } from "@/components/ui/button";
import { ItineraryCollection, type CollectionItinerary, type CollectionLinkProps } from "./itinerary-collection";

export interface NativeItineraryCollectionProps {
    onNavigate?: (path: string) => void;
    onDeleted?: (id: string) => void;
}

export interface NativeItinerarySummary extends CollectionItinerary {
    ownerId: string;
    highlights: null | string[];
    estimated_cost: null | string;
    subtitle: null | string;
    status: null | string;
    is_favorite: boolean;
}

export interface NativeItineraryCollectionDTO {
    itineraries: NativeItinerarySummary[];
    nextOffset: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 1000;
const MAX_BYTES = 1024 * 1024;
const MAX_COLLECTION_BYTES = 4 * 1024 * 1024;

function isPage(value: unknown, ownerId: string, offset: number, limit: number): value is NativeItineraryCollectionDTO {
    if (!value || typeof value !== "object") return false;
    const page = value as NativeItineraryCollectionDTO;
    return Array.isArray(page.itineraries) && page.itineraries.length <= limit
        && (page.nextOffset === null || (page.itineraries.length > 0 && Number.isSafeInteger(page.nextOffset)
            && page.nextOffset === offset + page.itineraries.length))
        && page.itineraries.every((row) => row && typeof row === "object"
            && typeof row.id === "string" && UUID.test(row.id) && row.ownerId === ownerId
            && [row.title, row.city, row.subtitle, row.estimated_cost, row.status].every((item) => item === null || typeof item === "string")
            && Number.isSafeInteger(row.days) && row.days > 0
            && (row.highlights === null || (Array.isArray(row.highlights) && row.highlights.every((item) => typeof item === "string")))
            && (row.local_score === null || (typeof row.local_score === "number" && Number.isFinite(row.local_score)))
            && typeof row.created_at === "string" && typeof row.is_favorite === "boolean"
            && !("activities" in row));
}

/** Bound the actual stream, not just the untrusted Content-Length header. */
async function readJSON(response: Response, signal: AbortSignal): Promise<{ value: unknown; bytes: number }> {
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
        void response.body?.cancel().catch(() => {});
        throw new Error("Response is too large.");
    }
    if (!response.body) throw new Error("Response is missing.");
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    try {
        for (;;) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            signal.throwIfAborted();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_BYTES) throw new Error("Response is too large.");
            text += decoder.decode(value, { stream: true });
        }
        return { value: JSON.parse(text + decoder.decode()), bytes };
    } finally {
        signal.removeEventListener("abort", cancel);
        cancel();
        reader.releaseLock();
    }
}

/** A request deadline covers headers and body, independently of the account/read scope. */
async function requestJSON(url: string, options: RequestInit, scope: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort(scope.reason);
    scope.addEventListener("abort", abort, { once: true });
    if (scope.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 20_000);
    let rejectAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
        if (controller.signal.aborted) rejectAbort();
    });
    try {
        return await Promise.race([cancelled, (async () => {
            controller.signal.throwIfAborted();
            const response = await fetch(url, { ...options, signal: controller.signal });
            controller.signal.throwIfAborted();
            if (!response.ok) void response.body?.cancel().catch(() => {});
            const body = response.ok ? await readJSON(response, controller.signal) : { value: null, bytes: 0 };
            return { response, ...body };
        })()]);
    } finally {
        clearTimeout(timer);
        scope.removeEventListener("abort", abort);
        controller.signal.removeEventListener("abort", rejectAbort);
    }
}

export function NativeItineraryCollection(props: NativeItineraryCollectionProps) {
    const session = useAppSession();
    if (session.status === "loading") return <p role="status">Checking your account...</p>;
    if (session.provider !== "better-auth" || session.status !== "ready" || !session.accountKey
        || !session.ownerId || !session.sessionId || !session.authUserId || !session.userRecordId) {
        return <p role="alert">This collection is not available for this account.</p>;
    }
    return <OwnedNativeCollection {...props} ownerId={session.ownerId} sessionId={session.sessionId}
        key={JSON.stringify([session.accountKey, session.ownerId, session.sessionId, session.authUserId, session.userRecordId])} />;
}

function OwnedNativeCollection({ ownerId, sessionId, onNavigate, onDeleted }: NativeItineraryCollectionProps & { ownerId: string; sessionId: string }) {
    const { refresh } = useAppSession();
    const callbacks = useRef({ refresh, onDeleted, onNavigate });
    callbacks.current = { refresh, onDeleted, onNavigate };
    const lifetime = useRef<AbortController | null>(null);
    const readController = useRef<AbortController | null>(null);
    const writeLock = useRef(false);
    const accessFault = useRef(false);
    const [rows, setRows] = useState<NativeItinerarySummary[]>([]);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [writing, setWriting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [blocked, setBlocked] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const collectionElement = useRef<HTMLElement | null>(null);
    const focusAfterDelete = useRef(false);

    useEffect(() => {
        if (focusAfterDelete.current && !loading && !writing) {
            focusAfterDelete.current = false;
            collectionElement.current?.focus();
        }
    }, [loading, writing]);
    const loadedBytes = useRef(0);
    const [byteLimit, setByteLimit] = useState(false);

    function current(signal: AbortSignal) {
        return !signal.aborted && !!lifetime.current && !lifetime.current.signal.aborted;
    }

    function checkAccess(response: Response, signal: AbortSignal) {
        if (![401, 403, 409].includes(response.status) || !current(signal)) return;
        accessFault.current = true;
        readController.current?.abort();
        setRows([]);
        setLoaded(false);
        setBlocked(true);
        setLoading(false);
        setError("Access could not be confirmed. Check your account before trying again.");
        void callbacks.current.refresh().catch(() => {});
    }

    async function load(offset: number, previous: NativeItinerarySummary[], deleted = false) {
        if (!lifetime.current || lifetime.current.signal.aborted || accessFault.current) return;
        const limit = Math.min(25, MAX_ROWS - previous.length);
        if (limit <= 0 || (offset !== 0 && byteLimit)) return;
        readController.current?.abort();
        const controller = new AbortController();
        readController.current = controller;
        setLoading(true);
        setError("");
        if (offset === 0) {
            loadedBytes.current = 0;
            setByteLimit(false);
            setRows([]);
            setLoaded(false);
        }
        try {
            const { response, value: page, bytes } = await requestJSON(`/api/itineraries?limit=${limit}&offset=${offset}`, {
                credentials: "same-origin", cache: "no-store", redirect: "error",
                headers: { "x-localley-session-id": sessionId },
            }, controller.signal);
            if (!current(controller.signal)) return;
            checkAccess(response, controller.signal);
            if (!current(controller.signal) || accessFault.current) return;
            if (!response.ok) throw new Error("Could not load itineraries.");
            if (!isPage(page, ownerId, offset, limit)) throw new Error("Invalid itinerary response.");
            const combined = [...previous, ...page.itineraries];
            if (new Set(combined.map((row) => row.id.toLowerCase())).size !== combined.length) throw new Error("Duplicate itinerary response.");
            if (combined.length > MAX_ROWS) throw new RangeError("Collection exceeds the 1,000-trip limit. This collection cannot load more.");
            if (loadedBytes.current + bytes > MAX_COLLECTION_BYTES) {
                setByteLimit(true);
                return;
            }
            loadedBytes.current += bytes;
            setRows(combined);
            setNextOffset(page.nextOffset);
            setLoaded(true);
        } catch (fault) {
            if (current(controller.signal)) {
                setRows([]);
                setLoaded(false);
                setNextOffset(null);
                loadedBytes.current = 0;
                setError(deleted ? "Itinerary deleted, but the list could not reload." : fault instanceof RangeError ? fault.message : "Could not load itineraries. The response may be invalid. Reload to try again.");
            }
        } finally {
            if (current(controller.signal)) setLoading(false);
        }
    }

    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        void load(0, []);
        return () => { controller.abort(); readController.current?.abort(); };
        // Identity changes remount this loader. A new callback must not restart private reads.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [Navigation] = useState(() => function Navigation({ href, children, className }: CollectionLinkProps) {
        return <a href={href} className={className} onClick={(event) => {
            if (callbacks.current.onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                event.preventDefault();
                callbacks.current.onNavigate(href);
            }
        }}>{children}</a>;
    });

    async function create(form: HTMLFormElement) {
        const signal = lifetime.current?.signal;
        if (!signal || !current(signal) || accessFault.current || writeLock.current) return;
        const title = String(new FormData(form).get("title") ?? "").trim();
        const city = String(new FormData(form).get("city") ?? "").trim();
        if (!title || !city) return;
        writeLock.current = true;
        readController.current?.abort();
        setLoading(false);
        setWriting(true);
        setError("");
        setNotice("");
        try {
            const { response, value: result } = await requestJSON("/api/itineraries", {
                method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
                headers: { "content-type": "application/json", "x-localley-session-id": sessionId },
                body: JSON.stringify({ title, city, days: [{ day: 1, activities: [{ name: "To plan" }] }] }),
            }, signal);
            if (!current(signal)) return;
            checkAccess(response, signal);
            if (!current(signal) || accessFault.current) return;
            if (response.status !== 201 || !result || typeof result !== "object" || !("itinerary" in result)
                || !result.itinerary || typeof result.itinerary !== "object" || typeof (result.itinerary as { id?: unknown }).id !== "string"
                || !UUID.test((result.itinerary as { id: string }).id) || (result.itinerary as { ownerId?: unknown }).ownerId !== ownerId) {
                throw new Error("Create failed.");
            }
            const id = (result.itinerary as { id: string }).id.toLowerCase();
            form.reset();
            setNotice("Trip created.");
            callbacks.current.onNavigate?.(`/itineraries/${id}`);
            if (current(signal)) await load(0, []);
        } catch {
            if (current(signal)) setError("Could not create this trip. Check the form and try again.");
        } finally {
            if (current(signal)) {
                writeLock.current = false;
                setWriting(false);
            }
        }
    }

    async function remove(id: string) {
        const signal = lifetime.current?.signal;
        if (!signal || !current(signal) || accessFault.current || writeLock.current || !rows.some((row) => row.id === id)) return;
        writeLock.current = true;
        readController.current?.abort();
        setLoading(false);
        setWriting(true);
        setError("");
        setNotice("");
        let deleted = false;
        try {
            const { response, value: result } = await requestJSON(`/api/itineraries/${encodeURIComponent(id)}`, {
                method: "DELETE", credentials: "same-origin", cache: "no-store", redirect: "error",
                headers: { "x-localley-session-id": sessionId },
            }, signal);
            if (!current(signal)) return;
            checkAccess(response, signal);
            if (!current(signal) || accessFault.current) return;
            if (response.status !== 200) throw new Error("Delete failed.");
            if (!result || typeof result !== "object" || !("success" in result) || result.success !== true) throw new Error("Invalid delete response.");
            deleted = true;
            focusAfterDelete.current = true;
            setRows([]);
            setNextOffset(null);
            setLoaded(false);
            setNotice("Itinerary deleted.");
            callbacks.current.onDeleted?.(id);
            if (current(signal)) await load(0, [], true);
        } catch {
            if (current(signal)) setError(deleted ? "Itinerary deleted, but the list could not reload." : "Could not confirm deletion. Reload the list and check before retrying.");
        } finally {
            if (current(signal)) {
                writeLock.current = false;
                setWriting(false);
            }
        }
    }

    return <section ref={collectionElement} tabIndex={-1} aria-label="Your itineraries" aria-busy={loading || writing}>
        {!blocked && <form aria-label="Create a trip" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}>
            <label>Title<input name="title" required maxLength={200} autoComplete="off" disabled={loading || writing} /></label>
            <label>City<input name="city" required maxLength={100} autoComplete="off" disabled={loading || writing} /></label>
            <Button type="submit" disabled={loading || writing}>Create a trip</Button>
        </form>}
        {notice && <p role="status">{notice}</p>}
        {error && <div role="alert"><p>{error}</p>
            {!blocked && <Button variant="outline" disabled={loading || writing} onClick={() => void load(0, [], !!notice)}>Reload itineraries</Button>}
            {!blocked && loaded && <Button variant="outline" disabled={loading || writing} onClick={() => setError("")}>Dismiss error</Button>}
        </div>}
        {loading && <p role="status">Loading itineraries...</p>}
        {loaded && !blocked && <ItineraryCollection itineraries={rows} Link={Navigation} onDelete={remove} loadedOnly={nextOffset !== null} />}
        {loaded && byteLimit && !blocked && <p role="alert">Collection size limit reached (4 MiB). Only previously loaded trips are shown. More trips remain unchecked.</p>}
        {loaded && nextOffset !== null && !blocked && (rows.length >= MAX_ROWS
            ? <p role="alert">Loaded 1,000 trips. More trips exist. This collection cannot load more.</p>
            : <Button variant="outline" disabled={loading || writing || byteLimit} onClick={() => void load(nextOffset, rows)}>Load more</Button>)}
    </section>;
}
