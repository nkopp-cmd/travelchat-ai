import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiNote, fieldClass, timeAgo } from "@/components/community/community-ui";
import { isAdminUser } from "@/lib/admin-auth";
import { appDataDb } from "@/lib/app-data/backend";
import { auth } from "@/lib/auth/server";
import { canUseCommunity } from "@/lib/community/access";
import type { CommunityDb } from "@/lib/community/qa";
import { LIMITS } from "@/lib/community/rules";
import { listTips } from "@/lib/community/tips";
import { d1SpotCardsByIds } from "@/lib/spots/d1-queries";
import { getLocalizedText } from "@/lib/spots/transform";
import { moderateTip, reportSpotTip } from "./actions";

export const metadata: Metadata = { title: "Traveller tips", robots: { index: false } };
export const dynamic = "force-dynamic";

function visitLabel(day: string | null): string | null {
  if (!day) return null;
  return `Visited ${new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

export default async function SpotTipsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  const { userId } = await auth();
  if (!userId || !canUseCommunity(userId)) notFound();
  const [{ id }, { error, reported }] = await Promise.all([params, searchParams]);
  const admin = isAdminUser(userId);
  const [[spot], tips] = await Promise.all([d1SpotCardsByIds([id]), listTips(appDataDb() as unknown as CommunityDb, id, admin)]);
  if (!spot) notFound();
  const name = getLocalizedText(spot.name);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link href={`/spots/${id}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {name}
      </Link>
      <PageHeader eyebrow="Traveller tips" eyebrowIcon={Users} title={name}
        lede="What did you find when you went? Opening days, queues, prices, how to pay." />
      {reported && <p role="status" className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">Thanks. We will review this report.</p>}

      <form id="tip" action="/api/community/tips" method="post" encType="multipart/form-data" className="mt-6 flex scroll-mt-24 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-surface">
        <input type="hidden" name="spotId" value={id} />
        <label htmlFor="tip-body" className="font-semibold text-foreground">Add a tip</label>
        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-foreground">{error}</p>}
        <Textarea id="tip-body" name="body" required minLength={LIMITS.tipMin} maxLength={LIMITS.tipMax} rows={3}
          placeholder="Went today: closed on Mondays, cash only, short queue before 11:00." />
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">Photo (optional, up to 5 MB; location data is removed)
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic" className="text-sm text-foreground file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-raised file:px-4 file:text-foreground" />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">Day you visited (optional)
            <Input type="date" name="visitedOn" max={today} defaultValue={today} className="w-auto" />
          </label>
          <Button type="submit" className="ml-auto">Post tip</Button>
        </div>
      </form>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {tips.length} {tips.length === 1 ? "tip" : "tips"}
      </h2>
      {tips.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted-foreground shadow-surface">No tips yet. Be the first to share what you found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tips.map((tip) => (
            <li key={tip.id} id={`t-${tip.id}`} className={`scroll-mt-24 rounded-2xl bg-surface p-4 shadow-surface ${tip.status === "hidden" ? "opacity-60" : ""}`}>
              <p className="whitespace-pre-line text-base leading-7 text-foreground">{tip.body}</p>
              {tip.photo_key && (
                // eslint-disable-next-line @next/next/no-img-element -- private, access-checked route; not for the image optimizer
                <img src={`/api/community/media/${tip.photo_key}`} alt="" loading="lazy" decoding="async"
                  className="mt-3 max-h-96 w-full rounded-xl bg-raised object-cover" />
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                {[tip.author_name, visitLabel(tip.visited_on), timeAgo(tip.created_at), tip.status === "hidden" ? "hidden" : null].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {tip.user_id !== userId && (
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 text-sm text-muted-foreground hover:bg-raised">Report</summary>
                    <form action={reportSpotTip} className="mt-2 flex gap-2">
                      <input type="hidden" name="spotId" value={id} />
                      <input type="hidden" name="tipId" value={tip.id} />
                      <select name="reason" aria-label="Reason" defaultValue="wrong" className={fieldClass}>
                        <option value="wrong">Wrong or outdated</option>
                        <option value="spam">Spam or advertising</option>
                        <option value="abuse">Rude or abusive</option>
                        <option value="unsafe">Unsafe advice</option>
                        <option value="other">Other</option>
                      </select>
                      <Button type="submit" variant="secondary">Send</Button>
                    </form>
                  </details>
                )}
                {admin && (
                  <form action={moderateTip} className="flex items-center gap-2">
                    <input type="hidden" name="spotId" value={id} />
                    <input type="hidden" name="tipId" value={tip.id} />
                    <input type="hidden" name="status" value={tip.status === "hidden" ? "visible" : "hidden"} />
                    <Button type="submit" variant="ghost" size="sm">{tip.status === "hidden" ? "Unhide" : "Hide"}</Button>
                    {tip.open_reports > 0 && <span className="text-sm font-semibold text-destructive">{tip.open_reports} open {tip.open_reports === 1 ? "report" : "reports"}</span>}
                    <AiNote verdict={tip.ai_verdict} reason={tip.ai_reason} />
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
