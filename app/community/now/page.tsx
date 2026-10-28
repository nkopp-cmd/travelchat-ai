import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Users } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { AiNote, VoteCount, fieldClass, timeAgo } from "@/components/community/community-ui";
import { isAdminUser } from "@/lib/admin-auth";
import { appDataDb } from "@/lib/app-data/backend";
import { auth } from "@/lib/auth/server";
import { requireCommunityPage } from "@/lib/community/access";
import type { CommunityDb } from "@/lib/community/qa";
import { communityCities, isCommunityCity, isoWeek, shiftWeek, weekRange } from "@/lib/community/rules";
import { listMeetups, listTravellers, myTrips } from "@/lib/community/trips";
import { ALL_CITIES, ENABLED_CITIES } from "@/lib/cities";
import { hideTraveller, joinGroup, leaveGroup, moderateTrip, reportTraveller } from "./actions";

export const metadata: Metadata = { title: "Travelling now", robots: { index: false } };
export const dynamic = "force-dynamic";

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function TravellingNowPage({ searchParams }: { searchParams: Promise<{ city?: string; week?: string; error?: string; reported?: string }> }) {
  const userId = await requireCommunityPage((await auth()).userId, "/community/now");
  const params = await searchParams;
  const db = appDataDb() as unknown as CommunityDb;
  const today = new Date().toISOString().slice(0, 10);
  const mine = await myTrips(db, userId, today);
  const city = params.city && isCommunityCity(params.city) ? params.city : mine[0]?.city ?? ENABLED_CITIES[0].slug;
  const week = params.week && weekRange(params.week) ? params.week : isoWeek(today);
  const range = weekRange(week)!;
  const admin = isAdminUser(userId);
  const [travellers, meetups] = await Promise.all([listTravellers(db, userId, city, range, admin), listMeetups(db, userId, city, range)]);
  const cityName = ALL_CITIES.find((c) => c.slug === city)?.name ?? city;
  const groupInputs = <><input type="hidden" name="city" value={city} /><input type="hidden" name="week" value={week} /></>;
  const groupHref = (w: string) => `/community/now?${new URLSearchParams({ city, week: w })}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link href="/community" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Community
      </Link>
      <PageHeader eyebrow="Travelling now" eyebrowIcon={Users} title={`${cityName} this week`}
        lede="See who else is in town, share tips and plan a meetup. Opt in per trip; leave any time." />
      <p className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
        Meet only in busy public places, tell a friend where you go, and never share your hotel or room number. Report anything that feels wrong.
      </p>

      <form method="get" className="mt-6 grid grid-cols-[1fr_auto] gap-2">
        <label className="sr-only" htmlFor="city">City</label>
        <select id="city" name="city" defaultValue={city} className={fieldClass}>
          {communityCities().map((c) => <option key={c.slug} value={c.slug}>{c.name}, {c.country}</option>)}
        </select>
        <input type="hidden" name="week" value={week} />
        <Button type="submit" variant="secondary">Show</Button>
      </form>
      <nav aria-label="Week" className="mt-3 flex items-center justify-between gap-2">
        <Link href={groupHref(shiftWeek(week, -1))} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm text-muted-foreground hover:bg-raised">
          <ArrowLeft className="size-4" aria-hidden="true" /> Earlier
        </Link>
        <span className="text-sm font-semibold text-foreground">{dayLabel(range.from)} – {dayLabel(range.to)}</span>
        <Link href={groupHref(shiftWeek(week, 1))} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm text-muted-foreground hover:bg-raised">
          Later <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </nav>
      {params.error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-foreground">{params.error}</p>}
      {params.reported && <p role="status" className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">Thanks. We will review this report.</p>}

      <section aria-labelledby="h-people" className="mt-8">
        <h2 id="h-people" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {travellers.length} {travellers.length === 1 ? "traveller" : "travellers"} in {cityName}
        </h2>
        {travellers.length === 0 ? (
          <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted-foreground shadow-surface">Nobody has joined this week yet. Add your trip below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {travellers.map((t) => (
              <li key={t.id} className={`rounded-2xl bg-surface p-4 shadow-surface ${t.status === "hidden" ? "opacity-60" : ""}`}>
                <p className="font-semibold text-foreground">{t.author_name}{t.user_id === userId ? " (you)" : ""}</p>
                <p className="text-sm text-muted-foreground">{dayLabel(t.from_day)} – {dayLabel(t.to_day)}{t.status === "hidden" ? " · hidden" : ""}</p>
                {t.note && <p className="mt-2 text-base leading-7 text-foreground">{t.note}</p>}
                {t.user_id !== userId && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <form action={hideTraveller}>{groupInputs}<input type="hidden" name="personId" value={t.user_id} />
                      <Button type="submit" variant="ghost" size="sm">Hide this person</Button>
                    </form>
                    <details>
                      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 text-sm text-muted-foreground hover:bg-raised">Report</summary>
                      <form action={reportTraveller} className="mt-2 flex gap-2">{groupInputs}<input type="hidden" name="tripId" value={t.id} />
                        <select name="reason" aria-label="Reason" defaultValue="unsafe" className={fieldClass}>
                          <option value="unsafe">Unsafe or suspicious</option>
                          <option value="spam">Spam or advertising</option>
                          <option value="abuse">Rude or abusive</option>
                          <option value="other">Other</option>
                        </select>
                        <Button type="submit" variant="secondary">Send</Button>
                      </form>
                    </details>
                    {admin && (
                      <form action={moderateTrip} className="flex items-center gap-2">{groupInputs}<input type="hidden" name="tripId" value={t.id} />
                        <input type="hidden" name="status" value={t.status === "hidden" ? "visible" : "hidden"} />
                        <Button type="submit" variant="ghost" size="sm">{t.status === "hidden" ? "Unhide" : "Hide for all"}</Button>
                        {t.open_reports > 0 && <span className="text-sm font-semibold text-destructive">{t.open_reports} open {t.open_reports === 1 ? "report" : "reports"}</span>}
                        <AiNote verdict={t.ai_verdict} reason={t.ai_reason} />
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-meetups" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="h-meetups" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Meetups and tips this week</h2>
          <Button asChild variant="secondary" size="sm"><Link href={`/community/ask?${new URLSearchParams({ city, topic: "meetup" })}`}>Post a meetup</Link></Button>
        </div>
        {meetups.length === 0 ? (
          <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted-foreground shadow-surface">No meetup posts this week.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {meetups.map((q) => (
              <li key={q.id}>
                <Link href={`/community/${q.id}`} className="flex gap-3 rounded-2xl bg-surface p-4 shadow-surface transition-colors hover:bg-raised">
                  <VoteCount score={q.score} voted={Boolean(q.voted)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug text-foreground">{q.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{q.author_name} · {q.answer_count} {q.answer_count === 1 ? "reply" : "replies"} · {timeAgo(q.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-mine" className="mt-8 rounded-2xl bg-surface p-4 shadow-surface">
        <h2 id="h-mine" className="font-semibold text-foreground">Your trips</h2>
        {mine.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {mine.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-raised p-3">
                <Link href={`/community/now?${new URLSearchParams({ city: t.city, week: isoWeek(t.from_day > today ? t.from_day : today) })}`} className="min-w-0 text-sm text-foreground hover:underline">
                  {ALL_CITIES.find((c) => c.slug === t.city)?.name ?? t.city}: {dayLabel(t.from_day)} – {dayLabel(t.to_day)}
                </Link>
                <form action={leaveGroup}>{groupInputs}<input type="hidden" name="tripId" value={t.id} />
                  <Button type="submit" variant="ghost" size="sm">Leave</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={joinGroup} className="mt-4 flex flex-col gap-3">{groupInputs}
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">City
            <select name="tripCity" required defaultValue={city} className={fieldClass}>
              {communityCities().map((c) => <option key={c.slug} value={c.slug}>{c.name}, {c.country}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">Arrive
              <Input type="date" name="from" required min={today} defaultValue={today} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">Leave
              <Input type="date" name="to" required min={today} defaultValue={range.to < today ? today : range.to} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">Note (optional)
            <Input name="note" maxLength={140} placeholder="Into street food and night markets, up for a group dinner." />
          </label>
          <Button type="submit" className="self-end">Join this group</Button>
        </form>
      </section>
    </main>
  );
}
