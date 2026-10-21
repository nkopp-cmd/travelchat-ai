"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Sparkles } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EvidenceResponse = {
  success: boolean;
  submission?: {
    id: string;
    status: string;
    spotId: string | null;
  };
  research?: {
    summary: string | null;
    confidence: number | null;
  };
  spotUrl?: string | null;
  spots?: Array<{
    spotId: string;
    spotUrl: string;
    name: string | null;
    city: string | null;
    confidence: number;
  }>;
  error?: {
    message: string;
  };
};

type SubmissionEvidenceFormProps = {
  submissionId: string;
  canonicalUrl: string;
  defaultCity?: string | null;
};

export function SubmissionEvidenceForm({
  submissionId,
  canonicalUrl,
  defaultCity,
}: SubmissionEvidenceFormProps) {
  const router = useRouter();
  const [placeHint, setPlaceHint] = useState("");
  const [cityHint, setCityHint] = useState(defaultCity || "");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/spots/social-submissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId,
          canonicalUrl,
          placeHint: placeHint.trim() || undefined,
          cityHint: cityHint.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const body = (await response.json()) as EvidenceResponse;

      if (!response.ok) {
        throw new Error(body.error?.message || "Could not add this evidence.");
      }

      setResult(body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-lg bg-raised p-3"
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">Help Localley place it</p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            Add the place name, city, or what the post shows. Localley will research again.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`place-${submissionId}`} className="text-foreground">
            Place name
          </Label>
          <Input
            id={`place-${submissionId}`}
            value={placeHint}
            onChange={(event) => setPlaceHint(event.target.value)}
            placeholder="Cafe Saeraul, Gyeongbokgung..."
            className="bg-black/20 text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`city-${submissionId}`} className="text-foreground">
            City
          </Label>
          <Input
            id={`city-${submissionId}`}
            value={cityHint}
            onChange={(event) => setCityHint(event.target.value)}
            placeholder="Seoul"
            className="bg-black/20 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`details-${submissionId}`} className="text-foreground">
          Details from the post
        </Label>
        <Textarea
          id={`details-${submissionId}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Caption says the address, storefront sign, neighborhood, menu item..."
          className="min-h-20 bg-black/20 text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm leading-6 text-[rgb(var(--ll-error))]">{error}</p>
      )}
      {result && (
        <div role="status" className="mt-3 rounded-lg bg-[rgb(var(--ll-success)/0.12)] p-3 text-sm text-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            Evidence saved
          </span>
          {result.research?.summary && (
            <p className="mt-1 leading-6 text-foreground">{result.research.summary}</p>
          )}
          {result.spotUrl && (
            <Button
              asChild
              size="sm"
              className="mt-3 rounded-lg"
            >
              <Link href={result.spotUrl}>
                Open spot
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting || (!placeHint.trim() && !cityHint.trim() && !notes.trim())}
        aria-busy={isSubmitting}
        className="mt-3 h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isSubmitting ? "Researching again..." : "Research again"}
      </Button>
    </form>
  );
}
