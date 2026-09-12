import { useEffect, useState, type ReactNode } from "react";

export type AppConfig = { mode: "local" | "preview"; catalogSource: "synthetic" | "seoul-pilot"; registration: "local-test" | "restricted-preview"; emailDelivery: "captured" | "cloudflare" };
const localConfig: AppConfig = { mode: "local", catalogSource: "synthetic", registration: "local-test", emailDelivery: "captured" };

export function ConfigGate({ children }: { children: (config: AppConfig) => ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/app-config", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
        if (response.status === 404 && local) { setConfig(localConfig); return; }
        if (!response.ok) throw new Error("Configuration unavailable");
        const value = await response.json() as AppConfig;
        const validLocal = local && value.mode === "local" && value.catalogSource === "synthetic" && value.registration === "local-test" && value.emailDelivery === "captured";
        const validPreview = (local || location.origin === "https://preview.localley.io") && value.mode === "preview" && value.catalogSource === "seoul-pilot" && value.registration === "restricted-preview" && value.emailDelivery === "cloudflare";
        if (!validLocal && !validPreview) throw new Error("Invalid configuration");
        if (!controller.signal.aborted) setConfig(value);
      } catch { if (!controller.signal.aborted) setError(true); }
    })();
    return () => controller.abort();
  }, [attempt]);
  if (!config) return <main className="config-gate"><h1>Localley migration preview</h1>{error ? <><p role="alert">Preview configuration is unavailable. Account access is blocked. No local mode was assumed.</p><button onClick={() => { setError(false); setAttempt(attempt + 1); }}>Retry configuration</button></> : <p role="status">Loading preview configuration...</p>}</main>;
  return <><div className="test-banner">{config.mode === "preview" ? "Cloudflare migration preview. Real Seoul places. Preview accounts are separate from the live service." : "Local migration test. Synthetic accounts and places. No real emails."}</div>{children(config)}</>;
}
