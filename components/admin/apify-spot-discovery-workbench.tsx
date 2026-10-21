"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ExternalLink, Loader2, MapPin, RefreshCw, Star, X } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DiscoveryCandidate = {
  id: string;
  city_slug: string;
  name: string;
  address: string;
  maps_url: string;
  category_name: string | null;
  total_score: number | null;
  reviews_count: number | null;
  primary_image_url: string;
  discovery_query: string | null;
  recommended_localley_score: 3 | 4 | 5;
  source_type?: "map_discovery" | "social_trend";
  social_source_url?: string | null;
};

type CandidateResponse = {
  items: DiscoveryCandidate[];
  generatedAt: string;
};

export function ApifySpotDiscoveryWorkbench() {
  const [items, setItems] = useState<DiscoveryCandidate[]>([]);
  const [city, setCity] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status: "pending", limit: "120" });
    if (city.trim()) params.set("city", city.trim().toLowerCase());
    try {
      const response = await fetch(`/api/admin/spots/apify-discovery?${params.toString()}`);
      const data = await response.json() as CandidateResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load discovery candidates");
      setItems(data.items);
      setScores(Object.fromEntries(data.items.map((item) => [
        item.id,
        String(item.recommended_localley_score),
      ])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load discovery candidates");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const groupedCities = useMemo(
    () => [...new Set(items.map((item) => item.city_slug))].sort(),
    [items],
  );

  async function reviewCandidate(item: DiscoveryCandidate, action: "approve" | "reject") {
    setReviewingId(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/spots/apify-discovery", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          action,
          localleyScore: Number(scores[item.id] || item.recommended_localley_score),
        }),
      });
      const data = await response.json() as { error?: string; spotId?: string };
      if (!response.ok) throw new Error(data.error || "Could not review candidate");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setNotice(action === "approve" ? `${item.name} was added to Localley.` : `${item.name} was rejected.`);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review candidate");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="bg-primary/10 text-foreground">
              Private review queue
            </Badge>
            <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">Apify spot discovery</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground">
              One cost-capped city scrape per day, prioritizing structured leads from this week&apos;s viral posts. Results remain private until an admin approves the place and its Localley score.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="bg-raised text-foreground">
              <Link href="/admin/spots/quality">Quality queue</Link>
            </Button>
            <Button onClick={() => void loadCandidates()} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-xl bg-black/15 p-4 sm:grid-cols-[1fr_auto]">
          <Input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void loadCandidates(); }}
            placeholder="Filter by city slug, e.g. seoul"
          />
          <div className="flex items-center gap-2 text-sm text-foreground">
            <MapPin className="h-4 w-4" />
            {items.length} pending across {groupedCities.length} cities
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-[rgb(var(--ll-error)/0.12)] p-3 text-sm text-foreground">{error}</p>}
        {notice && <p className="mt-4 rounded-lg bg-[rgb(var(--ll-success)/0.12)] p-3 text-sm text-foreground">{notice}</p>}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading private candidates
          </div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-xl p-12 text-center text-foreground">
            No pending candidates for this filter.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-xl bg-black/20">
                <div className="relative h-44">
                  <Image
                    src={item.primary_image_url}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/65 to-transparent" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-primary/75">{item.city_slug.replaceAll("-", " ")}</p>
                      <h2 className="mt-1 text-lg font-semibold text-foreground">{item.name}</h2>
                    </div>
                    <a href={item.maps_url} target="_blank" rel="noreferrer" className="rounded-md p-2 text-foreground hover:text-foreground" aria-label={`Open ${item.name} in Google Maps`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-foreground">{item.address}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {item.source_type === "social_trend" && (
                      <Badge className="bg-primary/10 text-foreground">
                        Viral social lead
                      </Badge>
                    )}
                    {item.category_name && <Badge className="bg-raised text-foreground">{item.category_name}</Badge>}
                    {item.total_score !== null && (
                      <Badge className="bg-[rgb(var(--ll-warning)/0.14)] text-foreground">
                        <Star className="mr-1 h-3 w-3 fill-current" /> {Number(item.total_score).toFixed(1)}
                      </Badge>
                    )}
                    {item.reviews_count !== null && <Badge className="bg-raised text-foreground">{item.reviews_count.toLocaleString()} reviews</Badge>}
                  </div>
                  {item.source_type === "social_trend" && item.social_source_url && (
                    <a
                      href={item.social_source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs text-foreground hover:text-foreground"
                    >
                      Review private source evidence <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                    <Select value={scores[item.id]} onValueChange={(value) => setScores((current) => ({ ...current, [item.id]: value }))}>
                      <SelectTrigger className="bg-raised text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 · Mixed crowd</SelectItem>
                        <SelectItem value="4">4 · Local favorite</SelectItem>
                        <SelectItem value="5">5 · Hidden gem</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="outline" disabled={reviewingId === item.id} onClick={() => void reviewCandidate(item, "reject")} className="shrink-0 bg-[rgb(var(--ll-error)/0.12)] text-foreground hover:bg-rose-400/20" aria-label={`Reject ${item.name}`}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="icon" disabled={reviewingId === item.id} onClick={() => void reviewCandidate(item, "approve")} className="shrink-0" aria-label={`Approve ${item.name}`}>
                      {reviewingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
