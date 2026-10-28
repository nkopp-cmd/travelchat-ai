import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldClass } from "@/components/community/community-ui";
import { auth } from "@/lib/auth/server";
import { requireCommunityPage } from "@/lib/community/access";
import { COMMUNITY_TOPICS, LIMITS, communityCities, isCommunityTopic } from "@/lib/community/rules";
import { askQuestion } from "../actions";

export const metadata: Metadata = { title: "Ask a question", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ error?: string; city?: string; topic?: string }> }) {
  const userId = await requireCommunityPage((await auth()).userId, "/community/ask");
  const { error, city, topic } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <Link href="/community" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Community
      </Link>
      <PageHeader eyebrow="Community" eyebrowIcon={Users} title="Ask a question"
        lede="Be specific: where, when and what you already tried. No links or phone numbers." />
      {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-foreground">{error}</p>}
      <form action={askQuestion} className="mt-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">City
            <select name="city" required defaultValue={city ?? ""} className={fieldClass}>
              <option value="" disabled>Pick a city</option>
              {communityCities().map((c) => <option key={c.slug} value={c.slug}>{c.name}, {c.country}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">Topic
            <select name="topic" required defaultValue={topic && isCommunityTopic(topic) ? topic : ""} className={fieldClass}>
              <option value="" disabled>Pick a topic</option>
              {COMMUNITY_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">Your question
          <Input name="title" required minLength={LIMITS.titleMin} maxLength={LIMITS.titleMax} placeholder="Does the night market near Ximen take cards?" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">Details (optional)
          <Textarea name="body" maxLength={LIMITS.bodyMax} rows={5} placeholder="Dates, what you tried, anything that helps people answer." />
        </label>
        <Button type="submit" size="lg">Post question</Button>
      </form>
    </main>
  );
}
