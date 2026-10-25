import { ThumbsUp } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** Native select with the same field tokens as components/ui/input.tsx (no client JS). */
export const fieldClass = "bg-field text-field-foreground min-h-12 w-full rounded-md px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toISOString().slice(0, 10);
}

export function VoteCount({ score, voted, className }: { score: number; voted: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 text-sm font-semibold",
      voted ? "bg-primary/15 text-primary" : "bg-raised text-muted-foreground", className)}>
      <ThumbsUp weight={voted ? "fill" : "duotone"} className="size-4" aria-hidden="true" />
      {score}
    </span>
  );
}
