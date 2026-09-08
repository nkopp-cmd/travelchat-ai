import { createRoot } from "react-dom/client";
import { StoryDialog } from "@/components/itineraries/story-dialog";
import { Toaster } from "@/components/ui/toaster";
import { itineraryId, scenarios } from "./fixtures";
import "@/app/globals.css";
import "./preview.css";

const scenario = new URLSearchParams(location.search).get("scenario") || "unavailable";
document.cookie = `preview-scenario=${scenarios.includes(scenario) ? scenario : "unavailable"}; Path=/; SameSite=Strict`;
document.cookie = `preview-session=${crypto.randomUUID()}; Path=/; SameSite=Strict`;
createRoot(document.getElementById("root")!).render(<>
  <aside className="preview-banner">Component preview: simulated data. No generation or charges.</aside>
  <main className="preview-controls">
    <h1>Story studio component review</h1>
    <label>Simulated state <select value={scenario} onChange={event => { location.search = `?scenario=${event.target.value}`; }}>
      {scenarios.map(state => <option key={state}>{state}</option>)}
    </select></label>
    <p>Both buttons use the same test itinerary and owner. No Clerk session is required.</p>
    {["First instance", "Second instance"].map(name => <section key={name} aria-label={name}>
      <h2>{name}</h2>
      <StoryDialog itineraryId={itineraryId} itineraryTitle={"\uC11C\uC6B8 \uACE8\uBAA9 \uC5EC\uD589 - Korean test preview with a long itinerary title"} totalDays={1} />
    </section>)}
  </main>
  <Toaster />
</>);
