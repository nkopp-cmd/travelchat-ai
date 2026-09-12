import { hydrateRoot } from "react-dom/client";
import { Harness } from "./fixture";

hydrateRoot(document.getElementById("root")!, <Harness />, {
  onRecoverableError(error) { console.error("Hydration recovery:", error); },
});
