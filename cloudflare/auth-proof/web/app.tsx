import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Bookmark, Compass, MapPin, ShieldCheck } from "lucide-react";
import { api, authClient, clearPrivate, getSnapshot, logout, message, mutate, mutationKey, refreshContext, reloadSaved, subscribe, type Spot } from "./session";
import "./styles.css";

type Mode = "signin" | "signup" | "request" | "reset";
const titles: Record<Mode, string> = { signin: "Sign in", signup: "Create test login", request: "Request password reset", reset: "Reset password" };
const text = (value: Spot["name"] | undefined) => typeof value === "string" ? value : value?.en ?? Object.values(value ?? {})[0] ?? "";
const validId = (id: string | null) => id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
function readPending() {
  const query = validId(new URLSearchParams(location.search).get("pendingSpotId"));
  try { return query ?? validId(sessionStorage.getItem("pendingSpotId")); } catch { return query; }
}

function App() {
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
      remember(id); setMode("signin");
      setNotice("Sign in to continue. You will confirm this save after sign-in.");
      authHeading.current?.focus(); return;
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
      if (mode === "signup") setNotice("Request accepted. Eligible verification messages stay in the private local test outbox. No email was delivered.");
      if (mode === "request") setNotice("Request accepted. If this test account exists, its reset link stays in the private local test outbox.");
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
  const displayed = tab === "catalog" ? catalog.map((spot) => ({ id: spot.id, spot }))
    : (saved ?? []).map((row) => ({ id: row.spot_id, spot: row.spots }));
  return <>
    <a className="skip-link" href="#places">Skip to places</a>
    <header className="site-header"><a className="brand" href="/" aria-label="Localley home"><MapPin aria-hidden="true" />Localley</a><span className="eyebrow">Local proof / Discovery</span></header>
    <main className="layout">
      <aside className="auth-panel" aria-labelledby="account-title">
        <div className="section-icon"><ShieldCheck aria-hidden="true" /></div>
        <p className="eyebrow">Your test account</p>
        <h1 id="account-title" ref={authHeading} tabIndex={-1}>{mode === "reset" ? titles.reset : context.user && identityMatches ? "Account" : titles[mode]}</h1>
        <p className="muted">Test sign-in and saved places without changing your real Localley account.</p>
        {context.phase === "loading" && <p role="status">Checking your session...</p>}
        {context.user && identityMatches && <div className="identity"><strong>{context.user.name}</strong><span>{context.user.email}</span><span>Verified test identity</span></div>}
        {context.phase === "signedout" && <p className="muted">Signed out. Browse the catalog or use a synthetic account.</p>}
        {context.phase === "unverified" && <p role="alert">Email verification is required. The test harness opens the private verification link. Then sign in.</p>}
        {context.phase === "unlinked" && <><p>No Localley account mapping exists for this login. Create a separate test account to start with empty saves.</p><button disabled={accountBusy === accountKey} onClick={async () => { setAccountBusy(accountKey); try { await mutate("/api/account/new", "POST"); } finally { setAccountBusy((previous) => previous === accountKey ? null : previous); } }}>{accountBusy === accountKey ? "Creating account..." : "Create new account"}</button></>}
        {context.phase === "incomplete" && <p role="alert">Your account mapping is incomplete. Saving is blocked until the local test administrator repairs it.</p>}
        {(context.phase === "unlinked" || context.phase === "incomplete") && <p className="muted">Legacy migration is not available here. Do not enter a real production token.</p>}
        {context.error && <p role="alert" className="error">{context.error}</p>}
        {(context.phase === "error" || context.phase === "unverified") && <button className="secondary" onClick={() => void refreshContext()}>Check session again</button>}
        {(context.session || context.phase === "blocked" || context.phase === "unverified") && <button className="secondary" disabled={authBusy} onClick={async () => { remember(null); lastKnownUser.current = undefined; setAuthBusy(true); await logout(); setAuthBusy(false); }}>{context.phase === "blocked" ? "Retry sign-out" : "Sign out"}</button>}
        {((!context.session && !observed.data?.user) || mode === "reset") && context.phase !== "blocked" && <>
          <div className="mode-buttons" aria-label="Authentication options">
            {(["signin", "signup"] as Mode[]).map((item) => <button className="secondary" key={item} aria-pressed={mode === item} disabled={authBusy} onClick={() => { setMode(item); setAuthError(""); }}>{titles[item]}</button>)}
          </div>
          <form onSubmit={submitAuth} aria-label={titles[mode]} key={JSON.stringify([mode, observed.data?.user.id, observed.data?.session.id])}>
            {mode === "signup" && <label>Test name<input name="name" autoComplete="name" required maxLength={100} disabled={authBusy} /></label>}
            {mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="name@example.test" disabled={authBusy} /></label>}
            {mode !== "request" && <label>{mode === "reset" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} maxLength={128} disabled={authBusy} /></label>}
            <button type="submit" disabled={authBusy}>{authBusy ? "Please wait..." : titles[mode]}</button>
          </form>
          <button className="text-button" disabled={authBusy} onClick={() => { setMode("request"); setAuthError(""); }}>Forgot password?</button>
        </>}
        {authError && <p className="error" role="alert">{authError}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
      </aside>
      <section id="places" className="places" aria-labelledby="places-title">
        <p className="eyebrow">Discover / Keep / Return</p><h2 id="places-title">A few places to keep.</h2>
        <p className="intro">Explore the synthetic catalog. Save a place to test your private collection.</p>
        <div className="view-buttons" aria-label="Place views"><button aria-pressed={tab === "catalog"} className="secondary" onClick={() => setTab("catalog")}><Compass aria-hidden="true" />Catalog</button><button aria-pressed={tab === "saved"} className="secondary" onClick={() => setTab("saved")}><Bookmark aria-hidden="true" />Saved places</button></div>
        {pending && <div className="continue"><p>A place is waiting for your confirmation. Nothing has been saved automatically.</p><button disabled={!ready || !saved || !!context.savedError || busySpots.has(mutationKey(context.session, `/api/spots/save/${pending}`))} onClick={() => void save(pending, false)}>Continue saving{catalog.some((spot) => spot.id === pending) ? `: ${text(catalog.find((spot) => spot.id === pending)?.name)}` : " selected place"}</button><button className="secondary" onClick={() => remember(null)}>Cancel selection</button></div>}
        {ready && context.savedError && <div className="error" role="alert"><p>Could not refresh saved places. Previous results may be out of date. {context.savedError}</p><button className="secondary" onClick={() => void reloadSaved()}>Retry saved places</button></div>}
        {tab === "catalog" && catalogError && <div className="error" role="alert"><p>{catalogError}</p><button className="secondary" onClick={() => void loadCatalog(catalog.length ? nextOffset ?? 0 : 0)}>Retry catalog</button></div>}
        {tab === "catalog" && catalogBusy && <p role="status">Loading catalog...</p>}
        {tab === "catalog" && !catalogBusy && !catalogError && catalog.length === 0 && <p className="empty">No test places are available.</p>}
        {tab === "saved" && !ready && <p className="empty">Sign in with a verified, linked test account to view saved places.</p>}
        {tab === "saved" && ready && !saved && !context.savedError && <p role="status">Loading saved places...</p>}
        {tab === "saved" && saved?.length === 0 && !context.savedError && <p className="empty">No saved places yet. Choose a place from the catalog.</p>}
        <div className="spot-grid">{displayed.map(({ id, spot }) => {
          const isSaved = saved?.some((row) => row.spot_id === id) ?? false;
          const title = spot ? text(spot.name) : "Unavailable place";
          const pendingMutation = busySpots.has(mutationKey(context.session, `/api/spots/save/${id}`));
          return <article className="spot-card" key={id} aria-label={title}>
            <div className="spot-meta"><MapPin aria-hidden="true" /><span>{spot?.category ?? "Unavailable"}</span><span className="synthetic">Test place</span></div>
            <h3>{title}</h3><p>{spot ? text(spot.description) : "This place is no longer in the catalog. You can remove this saved entry."}</p>
            {spot?.localley_score != null && <p className="score">Test Localley score <strong>{spot.localley_score}</strong></p>}
            <button className={isSaved ? "secondary" : ""} aria-label={`${isSaved ? "Remove saved place" : "Save place"}: ${title}${spot ? "" : ` (${id})`}`} aria-pressed={isSaved} aria-busy={pendingMutation} disabled={pendingMutation || context.phase === "blocked" || context.phase === "loading" || (ready && (!saved || !!context.savedError))} onClick={() => void save(id, isSaved)}><Bookmark aria-hidden="true" />{pendingMutation ? "Updating..." : isSaved ? "Remove saved place" : "Save place"}</button>
          </article>;
        })}</div>
        {tab === "catalog" && nextOffset !== null && <button className="secondary load-more" disabled={catalogBusy} onClick={() => void loadCatalog(nextOffset)}>Load more places</button>}
        <p className="footnote">Synthetic records only. No photos, rewards, or real account migration.</p>
      </section>
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
