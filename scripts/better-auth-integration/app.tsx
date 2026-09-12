import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { createAuthClient } from "better-auth/react";
import { BetterAuthSessionProvider } from "../../providers/better-auth-session-provider";
import { useAppSession } from "../../providers/app-session-provider";
import { SaveSpotButton } from "../../components/spots/save-spot-button";
import { SpotInteractions } from "../../components/spots/spot-interactions";
import { Toaster } from "../../components/ui/toaster";
import { NativeItineraryEditor } from "../../components/itineraries/native-itinerary-editor";
import { NativeItineraryCollection } from "../../components/itineraries/native-itinerary-collection";
import { planningSpot, tripIds } from "./public-fixture.mjs";

const auth = createAuthClient({ baseURL: location.origin, basePath: "/api/auth",
  fetchOptions: { credentials: "same-origin", redirect: "error" } });
const spotId = "10000000-0000-4000-8000-000000000001";
const spotName = "Synthetic quiet reading cafe";

function Fixture() {
  const session = useAppSession();
  const [result, setResult] = useState("");
  const [trip, setTrip] = useState("");
  const [destination, setDestination] = useState("");
  const [collection, setCollection] = useState(false);
  const [deleted, setDeleted] = useState<string[]>([]);
  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    const response = action === "reset-request"
      ? await auth.requestPasswordReset({ email, redirectTo: location.origin + "/" })
      : action === "reset-submit"
      ? await auth.resetPassword({ token: new URLSearchParams(location.search).get("token") ?? "", newPassword: password })
      : action === "signup"
      ? await auth.signUp.email({ email, password, name: "Synthetic local account", callbackURL: location.origin + "/" })
      : await auth.signIn.email({ email, password });
    setResult(response.error ? `Auth error ${response.error.status}` : "Auth success");
    if (action === "reset-submit" && !response.error) history.replaceState(null, "", "/");
    await session.refresh();
  }
  return <main>
    <header><p>LOCALLEY / LOCAL HTTPS TEST</p><h1>Root session integration</h1>
      <p>Synthetic fixtures only. These are not real venues or customer accounts.</p></header>
    <section aria-label="Session" data-identity-cleared={
      [session.authUserId, session.sessionId, session.ownerId, session.userRecordId].every((value) => value === null)
    }><h2>Actual shared provider</h2>
      <p>Status: <strong data-testid="status">{session.status}</strong></p>
      <p>Bookmark access: <span data-testid="capability">{String(session.canBookmark)}</span></p>
      <button onClick={() => { void session.refresh(); }}>Refresh session</button>
      <button onClick={async () => { await auth.signOut(); await session.refresh(); }}>Sign out</button>
      <button disabled={session.status !== "unlinked"} onClick={async () => {
        const response = await fetch("/api/account/new", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "x-localley-session-id": session.sessionId! }, body: "{}" });
        setResult(`Account ${response.status}`); await session.refresh();
      }}>Create new local account</button>
    </section>
    <article><p>SYNTHETIC SPOT / NOT A REAL VENUE</p><h2>{spotName}</h2>
      <p>Actual root components. Native Worker saves go to temporary D1 only.</p>
      <div className="controls"><div data-testid="save"><h3>SaveSpotButton</h3><SaveSpotButton spotId={spotId} spotName={spotName} /></div>
        <div data-testid="interactions"><h3>SpotInteractions</h3><SpotInteractions spotId={spotId} spotName={spotName} /></div></div>
    </article>
    <section><h2>Fixture authentication controls</h2><p>Official Better Auth SDK. No replacement session provider.</p>
      <form onSubmit={authenticate}><label>Email<input name="email" type="email" required autoComplete="off" /></label>
        <label>Password<input name="password" type="password" required autoComplete="off" /></label>
        <button type="submit" value="signup">Sign up</button><button type="submit" value="signin">Sign in</button>
        <button type="submit" value="reset-request">Request password reset</button>
        {new URLSearchParams(location.search).has("token") && <button type="submit" value="reset-submit">Reset password</button>}</form>
      <p role="status" data-testid="auth-result">{result}</p>
    </section>
    <section aria-label="Editor fixture controls"><label>Trip ID<select aria-label="Trip ID" value={trip}
      onChange={(event) => { setTrip(event.target.value); setDestination(""); }}>
      <option value="">Editor closed</option>{tripIds.map((id) => <option key={id} value={id}>{id}</option>)}
    </select></label><p data-testid="destination">{destination}</p></section>
    <section aria-label="Collection fixture controls"><button onClick={() => setCollection(!collection)}>
      {collection ? "Close collection" : "Open collection"}</button>
      <output data-testid="deleted-callbacks">{deleted.join(",")}</output></section>
    <div data-testid="collection">{collection && <NativeItineraryCollection onNavigate={(path) => {
      const match = /^\/itineraries\/([0-9a-f-]{36})$/i.exec(path);
      if (!match) throw new Error("Unexpected collection destination");
      setDestination(path); setTrip(match[1]);
    }} onDeleted={(id) => { setDeleted((previous) => [...previous, id]); setTrip((current) => current === id ? "" : current); }} />}</div>
    <div data-testid="editor">{trip && <NativeItineraryEditor id={trip.toUpperCase()} planningSpot={planningSpot}
      onNavigate={(path) => { setDestination(path); setTrip(""); }} />}</div><Toaster />
  </main>;
}

createRoot(document.getElementById("root")!).render(<BetterAuthSessionProvider onSignIn={(returnTo) => {
  history.pushState(null, "", `/sign-in?${new URLSearchParams({ redirect_url: returnTo })}`);
}}><Fixture /></BetterAuthSessionProvider>);
