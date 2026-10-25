import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/textarea";
import { VoteCount, fieldClass, timeAgo } from "@/components/community/community-ui";
import { isAdminUser } from "@/lib/admin-auth";
import { appDataDb } from "@/lib/app-data/backend";
import { auth } from "@/lib/auth/server";
import { canUseCommunity } from "@/lib/community/access";
import { getQuestion, openReportCounts, type CommunityDb } from "@/lib/community/qa";
import { LIMITS, topicLabel } from "@/lib/community/rules";
import { ALL_CITIES } from "@/lib/cities";
import { answerQuestion, moderate, reportContent, vote } from "../actions";

export const metadata: Metadata = { title: "Community question", robots: { index: false } };
export const dynamic = "force-dynamic";

type Target = { type: "question" | "answer"; id: string; ownerId: string; score: number; voted: boolean; status: string };

function Actions({ target, questionId, viewerId, admin, reports }: { target: Target; questionId: string; viewerId: string; admin: boolean; reports: number }) {
  const own = target.ownerId === viewerId;
  const hidden = { questionId, targetType: target.type, targetId: target.id };
  const inputs = Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <form action={vote}>{inputs}
        <button type="submit" disabled={own} aria-label={target.voted ? "Remove upvote" : "Upvote"} className="rounded-xl disabled:opacity-60">
          <VoteCount score={target.score} voted={target.voted} />
        </button>
      </form>
      {!own && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 text-sm text-muted-foreground hover:bg-raised">Report</summary>
          <form action={reportContent} className="mt-2 flex gap-2">{inputs}
            <select name="reason" aria-label="Reason" defaultValue="spam" className={fieldClass}>
              <option value="spam">Spam or advertising</option>
              <option value="abuse">Rude or abusive</option>
              <option value="unsafe">Unsafe advice</option>
              <option value="wrong">Wrong information</option>
              <option value="other">Other</option>
            </select>
            <Button type="submit" variant="secondary">Send</Button>
          </form>
        </details>
      )}
      {admin && (
        <form action={moderate} className="flex items-center gap-2">{inputs}
          <input type="hidden" name="status" value={target.status === "hidden" ? "visible" : "hidden"} />
          <Button type="submit" variant="ghost" size="sm">{target.status === "hidden" ? "Unhide" : "Hide"}</Button>
          {reports > 0 && <span className="text-sm font-semibold text-destructive">{reports} open {reports === 1 ? "report" : "reports"}</span>}
        </form>
      )}
    </div>
  );
}

export default async function QuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  const { userId } = await auth();
  if (!userId || !canUseCommunity(userId)) notFound();
  const [{ id }, { error, reported }] = await Promise.all([params, searchParams]);
  const admin = isAdminUser(userId);
  const db = appDataDb() as unknown as CommunityDb;
  const found = await getQuestion(db, id, userId, admin);
  if (!found) notFound();
  const { question, answers } = found;
  const reports = admin ? await openReportCounts(db, [question.id, ...answers.map((a) => a.id)]) : new Map<string, number>();
  const city = ALL_CITIES.find((c) => c.slug === question.city);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link href={`/community?city=${question.city}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {city?.name ?? "Community"} questions
      </Link>
      {reported && <p role="status" className="mb-4 rounded-xl bg-primary/10 p-3 text-sm text-foreground">Thanks. We will review this report.</p>}
      <article className={`rounded-2xl bg-surface p-5 shadow-surface ${question.status === "hidden" ? "opacity-60" : ""}`}>
        <p className="text-sm text-muted-foreground">{city?.name ?? question.city} · {topicLabel(question.topic)}{question.status === "hidden" ? " · hidden" : ""}</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight text-foreground">{question.title}</h1>
        {question.body && <p className="mt-3 whitespace-pre-line text-base leading-7 text-foreground">{question.body}</p>}
        <p className="mt-3 text-sm text-muted-foreground">{question.author_name} · {timeAgo(question.created_at)}</p>
        <Actions questionId={question.id} viewerId={userId} admin={admin} reports={reports.get(question.id) ?? 0}
          target={{ type: "question", id: question.id, ownerId: question.user_id, score: question.score, voted: Boolean(question.voted), status: question.status }} />
      </article>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {question.answer_count} {question.answer_count === 1 ? "answer" : "answers"}
      </h2>
      <ul className="flex flex-col gap-2">
        {answers.map((a) => (
          <li key={a.id} id={`a-${a.id}`} className={`scroll-mt-24 rounded-2xl bg-surface p-4 shadow-surface ${a.status === "hidden" ? "opacity-60" : ""}`}>
            <p className="whitespace-pre-line text-base leading-7 text-foreground">{a.body}</p>
            <p className="mt-2 text-sm text-muted-foreground">{a.author_name} · {timeAgo(a.created_at)}{a.status === "hidden" ? " · hidden" : ""}</p>
            <Actions questionId={question.id} viewerId={userId} admin={admin} reports={reports.get(a.id) ?? 0}
              target={{ type: "answer", id: a.id, ownerId: a.user_id, score: a.score, voted: Boolean(a.voted), status: a.status }} />
          </li>
        ))}
      </ul>

      {question.status === "visible" && (
        <form id="answer" action={answerQuestion} className="mt-6 flex scroll-mt-24 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-surface">
          <input type="hidden" name="questionId" value={question.id} />
          <label htmlFor="answer-body" className="font-semibold text-foreground">Your answer</label>
          {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-foreground">{error}</p>}
          <Textarea id="answer-body" name="body" required minLength={LIMITS.answerMin} maxLength={LIMITS.bodyMax} rows={4}
            placeholder="What worked for you? Say when you were there." />
          <Button type="submit" className="self-end">Post answer</Button>
        </form>
      )}
    </main>
  );
}
