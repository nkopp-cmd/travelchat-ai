import { headers } from "next/headers";
import SourceGuideApplication from "@/components/guide/source-guide-application";
import { PreviewGuideApplication } from "@/components/guide/preview-guide-application";
import { previewGuideApplicationPage, type PreviewGuideApplicationState } from "@/lib/app-data/preview-guide-application-page";

export default async function GuideApplyPage({ searchParams }: {
  searchParams: Promise<{ data_candidate?: string | string[] }>;
}) {
  const params = await searchParams;
  const flag = Array.isArray(params.data_candidate) ? params.data_candidate[0] : params.data_candidate;
  const host = (await headers()).get("host");
  if (host !== "localley-next-preview.nkopp.workers.dev" || flag !== "d1") return <SourceGuideApplication />;
  let state: PreviewGuideApplicationState = { kind: "unavailable" };
  if (process.env.AUTH_MAIL_MODE === "outbox" && process.env.SUPABASE_READ_ONLY === "true") {
    try { state = await previewGuideApplicationPage(); }
    catch { /* Private candidate failures must never enter the source form. */ }
  }
  return <PreviewGuideApplication state={state} />;
}
