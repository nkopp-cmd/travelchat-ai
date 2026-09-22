import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Bookmark, Compass, MapPin, ShieldCheck } from "lucide-react";
import { api, authClient, clearPrivate, getSnapshot, logout, message, mutate, mutationKey, refreshContext, reloadSaved, subscribe, type Spot } from "./session";
import { ConfigGate, type AppConfig } from "./config";
import { CatalogMap, ListingPhotos, PlacePhoto, coordinates, reviewedPhoto, sourceLink, placeText } from "./catalog";
import { TripsPane } from "./trips";
import { CurrentTrends } from "./trends";
import { NativeChat } from "./chat";
import "./styles.css";

type Mode = "signin" | "signup" | "request" | "reset";
const titles: Record<Mode, string> = { signin: "Sign in", signup: "Create test login", request: "Request password reset", reset: "Reset password" };
const text = (value: Spot["name"] | undefined) => typeof value === "string" ? value : value?.en ?? Object.values(value ?? {})[0] ?? "";
const validId = (id: string | null) => id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
function readPending() {
  const query = validId(new URLSearchParams(location.search).get("pendingSpotId"));
  try { return query ?? validId(sessionStorage.getItem("pendingSpotId")); } catch { return query; }
}

function App({ config }: { config: AppConfig }) {
  const preview = config.mode === "preview";
  const authTitles = { ...titles, signup: preview ? "Create preview login" : titles.signup };
  const [authOpen, setAuthOpen] = useState(() => !preview || new URLSearchParams(location.search).has("token") || new URLSearchParams(location.search).has("error") || !!readPending());
  const [selected, setSelected] = useState<string | null>(null);
  const context = useSyncExternalStore(subscribe, getSnapshot);
  const observed = authClient.useSession();
  const [mode, setMode] = useState<Mode>(() => new URLSearchParams(location.search).has("token") ? "reset" : "signin");
  const token = useRef(new URLSearchParams(location.search).get("token"));
  const [authBusy, setAuthBusy] = useState(false);
  const authLock = useRef(false);
  const [notice, setNotice] = useState("");
  const [authError, setAuthError] = useState(() => new URLSearchParams(location.search).has("error") ? "The email link is invalid or expired. Request a new link." : "");
  const [pending, setPending] = useState(readPending);
  const [tab, setTab] = useState("catalog");
  const [tripsVisited, setTripsVisited] = useState(false);
  const [catalog, setCatalog] = useState<Spot[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const catalogLock = useRef(false);
  const [busySpots, setBusySpots] = useState<Set<string>>(new Set());
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const accountKey = mutationKey(context.session, "/api/account/new");
  const lastKnownUser = useRef<string | undefined>(undefined);
  const authHeading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const userId = observed.data?.user.id;
    if (userId) {
      if (lastKnownUser.current && lastKnownUser.current !== userId) remember(null);
      lastKnownUser.current = userId;
    }
    void refreshContext();
  }, [observed.data?.user.id, observed.data?.session.id, observed.data?.user.emailVerified]);
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState !== "visible" || getSnapshot().phase === "blocked") return;
      // An imperative getSession does not update Better Auth's reactive session atom.
      clearPrivate();
      void observed.refetch({ query: { disableCookieCache: true } });
      void refreshContext();
    };
    const hide = () => { if (document.visibilityState === "hidden" && getSnapshot().phase !== "blocked") clearPrivate(); else focus(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", hide); };
  }, [observed.refetch]);
  useEffect(() => { void loadCatalog(0); }, []);

  async function loadCatalog(offset: number) {
    if (catalogLock.current) return;
    catalogLock.current = true;
    setCatalogBusy(true); setCatalogError("");
    try {
      const data = await api<{ spots: Spot[]; nextOffset: number | null }>(`/api/spots?limit=24&offset=${offset}`);
      if (!Array.isArray(data.spots)) throw new Error("The catalog returned an invalid response.");
      setCatalog((previous) => offset ? [...previous, ...data.spots.filter((spot) => !previous.some((item) => item.id === spot.id))] : data.spots);
      setNextOffset(data.nextOffset);
    } catch (error) { setCatalogError(message(error)); }
    finally { catalogLock.current = false; setCatalogBusy(false); }
  }
  function remember(id: string | null) {
    setPending(id);
    try { if (id) sessionStorage.setItem("pendingSpotId", id); else sessionStorage.removeItem("pendingSpotId"); } catch { /* Memory still retains the public selection. */ }
    const url = new URL(location.href);
    if (id) url.searchParams.set("pendingSpotId", id); else url.searchParams.delete("pendingSpotId");
    history.replaceState(null, "", url);
  }
  async function save(id: string, remove: boolean) {
    if (context.phase !== "ready") {
      remember(id); setMode("signin"); setAuthOpen(true);
      setNotice("Sign in to continue. You will confirm this save after sign-in.");
      requestAnimationFrame(() => authHeading.current?.focus()); return;
    }
    const key = mutationKey(context.session, `/api/spots/save/${id}`);
    setBusySpots((previous) => new Set(previous).add(key));
    try {
      const success = await mutate("/api/spots/save", remove ? "DELETE" : "POST", id);
      if (success && pending === id) remember(null);
    } finally { setBusySpots((previous) => { const next = new Set(previous); next.delete(key); return next; }); }
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authLock.current) return;
    authLock.current = true; setAuthBusy(true); setAuthError(""); setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    try {
      if (mode === "signin" || mode === "signup" || mode === "reset") clearPrivate();
      const result = mode === "signin" ? await authClient.signIn.email({ email, password })
        : mode === "signup" ? await authClient.signUp.email({ name: String(data.get("name")), email, password, callbackURL: "/" })
        : mode === "request" ? await authClient.requestPasswordReset({ email, redirectTo: "/?view=reset" })
        : token.current ? await authClient.resetPassword({ newPassword: password, token: token.current })
        : { error: { message: "Reset link is missing. Request a new link." } };
      if (result.error) throw new Error(result.error.message ?? "Authentication failed. Please retry.");
      form.reset();
      if (mode === "signup") setNotice(preview ? "Request accepted. Registration is invitation-only. If eligible, check your email for a verification link." : "Request accepted. Eligible verification messages stay in the private local test outbox. No email was delivered.");
      if (mode === "request") setNotice(preview ? "Request accepted. If this preview account is eligible, check your email for a reset link." : "Request accepted. If this test account exists, its reset link stays in the private local test outbox.");
      if (mode === "reset") {
        token.current = null;
        const url = new URL(location.href); url.searchParams.delete("token"); url.searchParams.delete("error"); url.searchParams.delete("view");
        history.replaceState(null, "", url);
        setMode("signin"); setNotice("Password reset confirmed. Sign in with your new password.");
      }
      await refreshContext();
    } catch (error) { setAuthError(message(error)); await refreshContext(); }
    finally { authLock.current = false; setAuthBusy(false); }
  }

  // Never render the private cache against a different reactive Better Auth identity.
  const identityMatches = context.session?.authUserId === observed.data?.user.id && context.session?.sessionId === observed.data?.session.id;
  const ready = context.phase === "ready" && identityMatches;
  const saved = ready ? context.saved : undefined;
  const displayed = ["trips", "preferences", "trends", "chat"].includes(tab) ? [] : tab === "catalog" ? catalog.map((spot) => ({ id: spot.id, spot }))
    : (saved ?? []).map((row) => ({ id: row.spot_id, spot: preview && row.spots ? catalog.find((spot) => spot.id === row.spot_id) ?? row.spots : row.spots }));
  const hero = preview ? catalog.find((spot) => reviewedPhoto(spot)) : undefined;
  const shareCode = /^\/shared\/([a-z0-9]{8})$/.exec(location.pathname)?.[1] ?? null;
  const [shared, setShared] = useState<"loading" | "error" | { title: string | null; city: string | null; days: number; activities: unknown } | null>(shareCode ? "loading" : null);
  useEffect(() => {
    if (!shareCode) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/shared/${shareCode}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
        const value = await response.json() as { itinerary?: { title: string | null; city: string | null; days: number; activities: unknown } };
        if (!response.ok || !value.itinerary) throw new Error("unavailable");
        if (!controller.signal.aborted) setShared(value.itinerary);
      } catch { if (!controller.signal.aborted) setShared("error"); }
    })();
    return () => controller.abort();
  }, [shareCode]);
  function selectPlace(id: string) {
    setSelected(id);
    document.getElementById(`place-${id}`)?.focus({ preventScroll: true });
    document.getElementById(`place-${id}`)?.scrollIntoView({ block: "nearest" });
  }
  if (shareCode) {
    return <>
      <header className="site-header"><div className="site-header-inner"><a className="brand" href="/" aria-label="Localley home"><img src="/assets/localley-mark.png" alt="" width="36" height="36" />Localley</a><span className="eyebrow">Shared trip</span></div></header>
      <main className="layout preview-layout">
        {shared === "loading" && <p role="status">Loading shared trip...</p>}
        {shared === "error" && <p role="alert">This shared trip is unavailable.</p>}
        {shared && shared !== "loading" && shared !== "error" && <article className="auth-panel">
          <h1>{shared.title || "Shared trip"}</h1>
          <p className="muted">{shared.city || "City unavailable"} · {shared.days} days</p>
        </article>}
      </main>
    </>;
  }
  return <>
    <a className="skip-link" href="#places">Skip to places</a>
    <header className="site-header"><div className="site-header-inner"><a className="brand" href="/" aria-label="Localley home"><img src="/assets/localley-mark.png" alt="" width="36" height="36" />Localley</a><span className="eyebrow">{preview ? "Seoul / Migration preview" : "Local proof / Discovery"}</span></div></header>
    <main className={preview ? "layout preview-layout" : "layout"}>
      {preview && <div className="account-row"><p><strong>Separate preview accounts</strong><br />Invitation-only access. No live subscription or paid access transfers.</p><button className="secondary" aria-expanded={authOpen} aria-controls="preview-account" onClick={() => setAuthOpen(!authOpen)}>{authOpen ? "Close account access" : "Preview account access"}</button></div>}
      <aside id="preview-account" className="auth-panel" aria-labelledby="account-title" hidden={!authOpen}>
        <div className="section-icon"><ShieldCheck aria-hidden="true" /></div>
        <p className="eyebrow">{preview ? "Your preview account" : "Your test account"}</p>
        <h1 id="account-title" ref={authHeading} tabIndex={-1}>{mode === "reset" ? titles.reset : context.user && identityMatches ? "Account" : authTitles[mode]}</h1>
        <p className="muted">{preview ? "Use a unique password for this preview. Do not enter your existing Clerk or live Localley credentials." : "Test sign-in and saved places without changing your real Localley account."}</p>
        {context.phase === "loading" && <p role="status">Checking your session...</p>}
        {context.user && identityMatches && <div className="identity"><strong>{context.user.name}</strong><span>{context.user.email}</span><span>{preview ? "Verified preview identity" : "Verified test identity"}</span></div>}
        {context.phase === "signedout" && <p className="muted">{preview ? "Signed out. Browse Seoul places. Only invited email addresses can create a preview login." : "Signed out. Browse the catalog or use a synthetic account."}</p>}
        {context.phase === "unverified" && <p role="alert">{preview ? "Email verification is required. Open the verification link in your email, then sign in." : "Email verification is required. The test harness opens the private verification link. Then sign in."}</p>}
        {context.phase === "unlinked" && <><p>{preview ? "Create a separate preview profile with empty saves. This does not import your live account or paid access." : "No Localley account mapping exists for this login. Create a separate test account to start with empty saves."}</p><button disabled={accountBusy === accountKey} onClick={async () => { setAccountBusy(accountKey); try { await mutate("/api/account/new", "POST"); } finally { setAccountBusy((previous) => previous === accountKey ? null : previous); } }}>{accountBusy === accountKey ? "Creating account..." : preview ? "Create preview profile" : "Create new account"}</button></>}
        {context.phase === "incomplete" && <p role="alert">Your account mapping is incomplete. Saving is blocked until the {preview ? "preview" : "local test"} administrator repairs it.</p>}
        {!preview && (context.phase === "unlinked" || context.phase === "incomplete") && <p className="muted">Legacy migration is not available here. Do not enter a real production token.</p>}
        {context.error && <p role="alert" className="error">{context.error}</p>}
        {(context.phase === "error" || context.phase === "unverified") && <button className="secondary" onClick={() => void refreshContext()}>Check session again</button>}
        {(context.session || context.phase === "blocked" || context.phase === "unverified") && <button className="secondary" disabled={authBusy} onClick={async () => { remember(null); lastKnownUser.current = undefined; setAuthBusy(true); await logout(); setAuthBusy(false); }}>{context.phase === "blocked" ? "Retry sign-out" : "Sign out"}</button>}
        {((!context.session && !observed.data?.user) || mode === "reset") && context.phase !== "blocked" && <>
          <div className="mode-buttons" aria-label="Authentication options">
            {(["signin", "signup"] as Mode[]).map((item) => <button className="secondary" key={item} aria-pressed={mode === item} disabled={authBusy} onClick={() => { setMode(item); setAuthError(""); }}>{authTitles[item]}</button>)}
          </div>
          <form onSubmit={submitAuth} aria-label={authTitles[mode]} key={JSON.stringify([mode, observed.data?.user.id, observed.data?.session.id])}>
            {mode === "signup" && <label>{preview ? "Preview name" : "Test name"}<input name="name" autoComplete="name" required maxLength={100} disabled={authBusy} /></label>}
            {mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder={preview ? "Your invited email address" : "name@example.test"} disabled={authBusy} /></label>}
            {mode !== "request" && <label>{mode === "reset" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} maxLength={128} disabled={authBusy} /></label>}
            <button type="submit" disabled={authBusy}>{authBusy ? "Please wait..." : authTitles[mode]}</button>
          </form>
          <button className="text-button" disabled={authBusy} onClick={() => { setMode("request"); setAuthError(""); }}>Forgot password?</button>
        </>}
        {authError && <p className="error" role="alert">{authError}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
      </aside>
      <section id="places" className="places" aria-labelledby="places-title">
        <div id="discovery-lead" className={preview && tab !== "trends" && tab !== "chat" ? "discovery-lead" : ""}><div><p className="eyebrow">{tab === "trends" ? "Current week / Monitored sources" : tab === "chat" ? "Catalog / Published facts" : preview ? "Seoul / The first places" : "Discover / Keep / Return"}</p><h2 id="places-title">{tab === "trends" ? "Signals, with their sources." : tab === "chat" ? "Ask about a published place." : preview ? "Get to know Seoul." : "A few places to keep."}</h2>
        <p className="intro">{tab === "trends" ? "A small reviewed sample, with real publication times and explicit limits. Check the original source before making plans." : tab === "chat" ? "GPT-5.6 Luna answers from published catalog places. Check each source before you visit." : preview ? "Real places, credited photos, and a map to help you explore. Check each source before you visit." : "Explore the synthetic catalog. Save a place to test your private collection."}</p>{hero && tab !== "trends" && tab !== "chat" && <a className="hero-place-link" href={`#place-${hero.id}`} onClick={() => { setTab("catalog"); setSelected(hero.id); }}>{text(hero.name)}: view place details</a>}</div>{hero && tab !== "trends" && tab !== "chat" && <PlacePhoto spot={hero} hero />}</div>
        <div className="view-buttons" style={{ flexWrap: "wrap", whiteSpace: "nowrap" }} aria-label="Place views"><button aria-pressed={tab === "catalog"} className="secondary" onClick={() => setTab("catalog")}><Compass aria-hidden="true" />Catalog</button><button aria-pressed={tab === "saved"} className="secondary" onClick={() => setTab("saved")}><Bookmark aria-hidden="true" />Saved places</button><button aria-pressed={tab === "trips"} className="secondary" onClick={() => { setTripsVisited(true); setTab("trips"); }}>Trips</button><button aria-pressed={tab === "chat"} className="secondary" onClick={() => setTab("chat")}>Ask catalog</button><button aria-pressed={tab === "preferences"} className="secondary" onClick={() => setTab("preferences")}>Email preferences</button><button className="secondary" aria-pressed={tab === "trends"} onClick={() => setTab("trends")}>Current-week trends</button></div>
        {tab === "trends" && <CurrentTrends />}
        {tab === "chat" && <section aria-label="Catalog chat preview">
          {ready && context.session?.sessionId
            ? <NativeChat sessionId={context.session.sessionId} onSignIn={() => { setMode("signin"); setAuthOpen(true); }} />
            : <p role="status">Sign in with a verified, linked account to ask the catalog.</p>}
        </section>}
        {tab === "preferences" && <section aria-label="Email preferences preview">
          <h2>Email preferences</h2><p className="intro">Separate preview settings only. Optional emails start off. These controls do not send email or change your live account.</p>
          {ready && context.key && context.session?.ownerId && context.session.userRecordId
            ? <TripsPane key={context.key} preferences expected={{ authUserId: context.session.authUserId, sessionId: context.session.sessionId, ownerId: context.session.ownerId, userRecordId: context.session.userRecordId }} onSignIn={() => { setMode("signin"); setAuthOpen(true); }} />
            : <p role="status">Sign in with a verified, linked account to manage email preferences.</p>}
        </section>}
        {tripsVisited && <section aria-label="Trips preview" hidden={tab !== "trips"}>
          <h2>Trips</h2><p className="intro">Build a draft from published places or let Luna arrange them around your preferences. Review your route before you travel. Stories, billing, and admin are still outside this preview.</p>
          {ready && context.key && context.session?.ownerId && context.session.userRecordId
            ? <TripsPane key={context.key} expected={{ authUserId: context.session.authUserId, sessionId: context.session.sessionId, ownerId: context.session.ownerId, userRecordId: context.session.userRecordId }} onSignIn={() => { setMode("signin"); setAuthOpen(true); }} />
            : <><p role="status">Sign in with a verified, linked account to view trips.</p><button className="secondary" onClick={() => { setMode("signin"); setAuthOpen(true); requestAnimationFrame(() => authHeading.current?.focus()); }}>Open account access</button></>}
        </section>}
        {preview && tab === "catalog" && <CatalogMap spots={catalog} selected={selected} onSelect={selectPlace} />}
        {pending && !["preferences", "trends"].includes(tab) && <div className="continue"><p>A place is waiting for your confirmation. Nothing has been saved automatically.</p><button disabled={!ready || !saved || !!context.savedError || busySpots.has(mutationKey(context.session, `/api/spots/save/${pending}`))} onClick={() => void save(pending, false)}>Continue saving{catalog.some((spot) => spot.id === pending) ? `: ${text(catalog.find((spot) => spot.id === pending)?.name)}` : " selected place"}</button><button className="secondary" onClick={() => remember(null)}>Cancel selection</button></div>}
        {ready && context.savedError && <div className="error" role="alert"><p>Could not refresh saved places. Previous results may be out of date. {context.savedError}</p><button className="secondary" onClick={() => void reloadSaved()}>Retry saved places</button></div>}
        {tab === "catalog" && catalogError && <div className="error" role="alert"><p>{catalogError}</p><button className="secondary" onClick={() => void loadCatalog(catalog.length ? nextOffset ?? 0 : 0)}>Retry catalog</button></div>}
        {tab === "catalog" && catalogBusy && <p role="status">Loading catalog...</p>}
        {tab === "catalog" && !catalogBusy && !catalogError && catalog.length === 0 && <p className="empty">{preview ? "No Seoul places are available yet." : "No test places are available."}</p>}
        {tab === "saved" && !ready && <p className="empty">Sign in with a verified, linked {preview ? "preview" : "test"} account to view saved places.</p>}
        {tab === "saved" && ready && !saved && !context.savedError && <p role="status">Loading saved places...</p>}
        {tab === "saved" && saved?.length === 0 && !context.savedError && <p className="empty">No saved places yet. Choose a place from the catalog.</p>}
        <div className="spot-grid">{displayed.map(({ id, spot }) => {
          const isSaved = saved?.some((row) => row.spot_id === id) ?? false;
          const title = spot ? text(spot.name) : "Unavailable place";
          const pendingMutation = busySpots.has(mutationKey(context.session, `/api/spots/save/${id}`));
          return <article className="spot-card" key={id} id={`place-${id}`} tabIndex={-1} data-selected={selected === id} aria-label={title}>
            {preview && spot && (hero?.id === id ? <a className="hero-place-link" href="#discovery-lead">View this place's photo and credits above</a> : <PlacePhoto spot={spot} />)}
            <div className="spot-meta"><MapPin aria-hidden="true" /><span>{spot?.category ?? "Unavailable"}</span><span className="synthetic">{preview ? spot?.city ?? "Seoul pilot" : "Test place"}</span></div>
            <h3>{title}</h3><p>{spot ? text(spot.description) : "This place is no longer in the catalog. You can remove this saved entry."}</p>
            {!preview && spot?.localley_score != null && <p className="score">Test Localley score <strong>{spot.localley_score}</strong></p>}
            {preview && spot && <><p className="spot-address">{placeText(spot.address) || "Address unavailable. Check the public sources."}</p><p className="muted">{coordinates(spot) ? "Catalog location, not a verified entrance." : "Coordinates unavailable or invalid. No map pin is shown."}</p><ListingPhotos spot={spot} />{tab === "catalog" && coordinates(spot) && <button className="secondary" onClick={() => { setSelected(id); document.querySelector(".map-canvas")?.scrollIntoView({ block: "center" }); (document.querySelector(".map-canvas") as HTMLElement | null)?.focus({ preventScroll: true }); }}>Show on map: {title}</button>}<div className="source-links" aria-label={`Public sources for ${title}`}>{Array.isArray(spot.sourceUrls) && spot.sourceUrls.some((url) => sourceLink(url)) ? [...new Set(spot.sourceUrls)].map((url, index) => { const href = sourceLink(url); return href ? <a key={url} href={href} target="_blank" rel="noopener noreferrer">Source {index + 1}: {new URL(href).hostname}</a> : null; }) : <p className="muted">Public source links unavailable.</p>}</div></>}
            <button className={isSaved ? "secondary" : ""} aria-label={`${isSaved ? "Remove saved place" : "Save place"}: ${title}${spot ? "" : ` (${id})`}`} aria-pressed={isSaved} aria-busy={pendingMutation} disabled={pendingMutation || context.phase === "blocked" || context.phase === "loading" || (ready && (!saved || !!context.savedError))} onClick={() => void save(id, isSaved)}><Bookmark aria-hidden="true" />{pendingMutation ? "Updating..." : isSaved ? "Remove saved place" : "Save place"}</button>
          </article>;
        })}</div>
        {tab === "catalog" && nextOffset !== null && <button className="secondary load-more" disabled={catalogBusy} onClick={() => void loadCatalog(nextOffset)}>Load more places</button>}
        <p className="footnote">{preview ? "Seoul pilot catalog. Photos retain their source credits. Locations do not establish entrance access or opening hours." : "Synthetic records only. No photos, rewards, or real account migration."}</p>
      </section>
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<ConfigGate>{(config) => <App config={config} />}</ConfigGate>);
