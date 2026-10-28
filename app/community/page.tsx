import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Users } from "@/components/ui/icons";
import { VoteCount, fieldClass, timeAgo } from "@/components/community/community-ui";
import { appDataDb } from "@/lib/app-data/backend";
import { auth } from "@/lib/auth/server";
import { requireCommunityPage } from "@/lib/community/access";
import { listQuestions, type CommunityDb } from "@/lib/community/qa";
import { COMMUNITY_TOPICS, communityCities, isCommunityCity, isCommunityTopic, topicLabel } from "@/lib/community/rules";
import { ALL_CITIES } from "@/lib/cities";

export const metadata: Metadata = { title: "Community", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ city?: string; topic?: string }> }) {
  const userId = await requireCommunityPage((await auth()).userId, "/community");
  const params = await searchParams;
  const city = params.city && isCommunityCity(params.city) ? params.city : "";
  const topic = params.topic && isCommunityTopic(params.topic) ? params.topic : "";
  const questions = await listQuestions(appDataDb() as unknown as CommunityDb, userId, { city: city || undefined, topic: topic || undefined });
  const cityName = (slug: string) => ALL_CITIES.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <PageHeader eyebrow="Community" eyebrowIcon={Users} title="Ask travellers and locals"
        lede="Questions from people on the road in Asia. Answer what you know, upvote what helped."
        actions={<div className="flex gap-2">
          <Button asChild variant="secondary"><Link href="/community/now">Travelling now</Link></Button>
          <Button asChild><Link href="/community/ask">Ask a question</Link></Button>
        </div>} />
      <form method="get" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="sr-only" htmlFor="city">City</label>
        <select id="city" name="city" defaultValue={city} className={fieldClass}>
          <option value="">All cities</option>
          {communityCities().map((c) => <option key={c.slug} value={c.slug}>{c.name}, {c.country}</option>)}
        </select>
        <label className="sr-only" htmlFor="topic">Topic</label>
        <select id="topic" name="topic" defaultValue={topic} className={fieldClass}>
          <option value="">All topics</option>
          {COMMUNITY_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1">Filter</Button>
      </form>
      {questions.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-surface p-6 text-center shadow-surface">
          <p className="font-semibold text-foreground">No questions here yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Be the first: ask what you want to know about this place.</p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {questions.map((q) => (
            <li key={q.id}>
              <Link href={`/community/${q.id}`} className="flex gap-3 rounded-2xl bg-surface p-4 shadow-surface transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <VoteCount score={q.score} voted={Boolean(q.voted)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-foreground">{q.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {cityName(q.city)} · {topicLabel(q.topic)} · {q.answer_count} {q.answer_count === 1 ? "answer" : "answers"} · {timeAgo(q.created_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
