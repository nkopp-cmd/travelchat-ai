import { useEffect, useState } from "react";
import { nativeTrendPayloadSchema, type NativeTrendPayload } from "@/lib/native-trend-contract";
import { api } from "./session";

const utc = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
export function CurrentTrends() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ phase: "loading" | "ready" | "empty" | "error"; data?: NativeTrendPayload; error?: string }>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ phase: "loading" });
    const refresh = () => { controller.abort(); setAttempt(value => value + 1); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const run = async () => {
      try {
        const raw = await api<Record<string, unknown>>("/api/trends/current?city=tokyo", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (raw.status === "unready") { setState({ phase: "empty" }); return; }
        const { status, serverNow, ...rest } = raw;
        const data = nativeTrendPayloadSchema.parse(rest);
        if (status !== "ready" || typeof serverNow !== "string" || !Number.isFinite(Date.parse(serverNow))) throw new Error("Invalid trend response");
        const remaining = Date.parse(data.expiresAt) - Date.parse(serverNow);
        if (remaining <= 0 || remaining > 86400000) throw new Error("Expired trend response");
        setState({ phase: "ready", data });
        timer = setTimeout(() => setState({ phase: "empty" }), remaining);
      } catch {
        if (!controller.signal.aborted) setState({ phase: "error", error: "Current-week signals could not be checked. No stale ranking is shown." });
      }
    };
    void run(); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [attempt]);
  return <section className="current-trends" aria-label="Current-week trends">
    <div className="trend-heading"><h3>Tokyo / Reviewed signals</h3><button className="secondary" disabled={state.phase === "loading"} onClick={() => setAttempt(value => value + 1)}>Refresh signals</button></div>
    {state.phase === "loading" && <p role="status">Checking the current-week snapshot...</p>}
    {state.phase === "error" && <p className="error" role="alert">{state.error}</p>}
    {state.phase === "empty" && <p className="empty" role="status">No fresh reviewed signals are available. Unverified or older posts are not used to fill this list.</p>}
    {state.phase === "ready" && state.data && <>
      <p className="intro">{state.data.coverage}</p>
      <p className="muted">UTC week starting {state.data.weekStart}. Snapshot checked {utc(state.data.observedAt)}. Expires {utc(state.data.expiresAt)}.</p>
      <p className="muted">{state.data.sourceEntries} feed entries checked; {state.data.excludedEntries} older entries excluded; {state.data.unreviewedEntries} awaiting review. Other cities and sources are not represented.</p>
      <ol className="trend-list">{state.data.rankings.map(rank => <li key={rank.spotId} className="trend-entry" data-spot-id={rank.spotId}>
        <span className="trend-rank" aria-label={`Rank ${rank.rank}`}>{rank.rank}</span>
        <div><h4>{rank.name}</h4><p>{rank.address}</p><p>{rank.summary}</p>
          <p className="trend-source-kind">Venue-owned update, not an independent recommendation.</p>
          <dl className="trend-metrics">{Object.entries(rank.source.metrics).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value === null ? "Not reported" : value.toLocaleString("en")}</dd></div>)}</dl>
          <p className="muted">Observed counts from one source snapshot. Missing metrics are unknown, not zero. Ranking is limited to the reviewed sample.</p>
          <p><strong>{rank.source.label}</strong><br />Posted {utc(rank.source.publishedAt)}. {rank.postCount} accepted post.</p>
          <div className="source-links"><a href={rank.source.url} target="_blank" rel="noopener noreferrer">View original YouTube post</a>
            <a href={rank.source.ownerUrl} target="_blank" rel="noopener noreferrer">Official venue / channel source</a>
            <a href={rank.venueUrl} target="_blank" rel="noopener noreferrer">Open canonical Localley place</a></div>
        </div>
      </li>)}</ol>
      <p className="muted">No social images or videos are copied here. Counts are not live audience totals, and post freshness does not prove current venue conditions.</p>
    </>}
  </section>;
}
