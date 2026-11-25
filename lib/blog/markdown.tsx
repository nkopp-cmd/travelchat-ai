import Link from "next/link";
import type { ReactNode } from "react";
import { tripStoryAlt } from "./trip-story";

/**
 * Small Markdown renderer for our own blog posts: ## / ### headings, paragraphs,
 * "-" and "1." lists, pipe tables, **bold**, *italic*, `code` and [links](url), and trip-story section images
 * on their own line: ![alt](/media/trip-story/<sha>-1080.webp) (own AI story images only, trip-story plan T2).
 * No raw HTML: the source is text only, so React escapes everything.
 */
type Block =
  | { type: "h2" | "h3" | "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "img"; sha: string; alt: string };

/** Own trip-story image path (R2 trip-story/<sha>-<w>.<ext>); nothing else may appear as an image. */
const TRIP_STORY_IMAGE = /^!\[([^\]]+)\]\(\/media\/trip-story\/([0-9a-f]{64})-1080\.webp\)$/;

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("![")) {
      const image = TRIP_STORY_IMAGE.exec(line.trim());
      if (!image) throw new Error(`unsupported image ${line.trim()}`);
      blocks.push({ type: "img", sha: image[2], alt: tripStoryAlt(image[1]) });
      i++;
      continue;
    }
    const heading = /^(#{2,3}) (.+)$/.exec(line);
    if (heading) { blocks.push({ type: heading[1] === "##" ? "h2" : "h3", text: heading[2].trim() }); i++; continue; }
    if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const marker = ordered ? /^\d+\. / : /^- /;
      const items: string[] = [];
      while (i < lines.length && marker.test(lines[i])) items.push(lines[i++].replace(marker, "").trim());
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(cells(lines[i++]));
      const [head, rule, ...body] = rows;
      if (!rule || !rule.every((c) => /^:?-+:?$/.test(c))) throw new Error("table needs a | --- | rule line");
      blocks.push({ type: "table", head, rows: body });
      continue;
    }
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3} |- |\d+\. |\||!\[)/.test(lines[i])) text.push(lines[i++].trim());
    blocks.push({ type: "p", text: text.join(" ") });
  }
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

const AUTH_LINK = /^\/sign-(?:up|in)(?:[?#]|$)/;

/** Push BR3: a body link to the auth forms brings the reader back to the post (unless the link names its own target). */
export function authReturnHref(href: string, back?: string): string {
  if (!back || !AUTH_LINK.test(href) || /[?&]redirect_url=/.test(href)) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}redirect_url=${encodeURIComponent(back)}${hash === undefined ? "" : `#${hash}`}`;
}

export function renderInline(text: string, key = "i", back?: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) out.push(<strong key={k} className="font-semibold">{renderInline(m[1], k, back)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{renderInline(m[2], k, back)}</em>);
    else if (m[3] !== undefined) out.push(<code key={k} className="rounded bg-raised px-1">{m[3]}</code>);
    else {
      const href = m[5];
      const label = renderInline(m[4], k, back);
      if (href.startsWith("/")) out.push(<Link key={k} href={authReturnHref(href, back)} rel={AUTH_LINK.test(href) ? "nofollow" : undefined} prefetch={false} className="font-semibold text-primary underline underline-offset-2">{label}</Link>);
      else if (/^https:\/\//.test(href)) out.push(<a key={k} href={href} rel="noopener noreferrer nofollow" target="_blank" className="underline underline-offset-2">{label}</a>);
      else throw new Error(`unsupported link ${href}`);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function headingId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** 4:5 trip-story image (1080x1350): AVIF first, WebP fallback, 540/1080 px, lazy. No credit line, no label. */
export function TripStoryFigure({ sha, alt, className = "mt-6" }: { sha: string; alt: string; className?: string }) {
  const src = (w: number, ext: string) => `/media/trip-story/${sha}-${w}.${ext}`;
  const set = (ext: string) => `${src(540, ext)} 540w, ${src(1080, ext)} 1080w`;
  const sizes = "(min-width: 768px) 720px, 100vw";
  return (
    <figure className={className}>
      <picture>
        <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
        <img src={src(1080, "webp")} srcSet={set("webp")} sizes={sizes} width={1080} height={1350} alt={alt}
          loading="lazy" decoding="async" className="h-auto w-full rounded-2xl bg-muted object-cover" />
      </picture>
    </figure>
  );
}

export function BlogMarkdown({ source, returnPath }: { source: string; returnPath?: string }) {
  return (
    <>
      {parseBlocks(source).map((block, i) => {
        const k = `b${i}`;
        switch (block.type) {
          case "h2": return <h2 key={k} id={headingId(block.text)} className="mt-10 text-xl font-bold text-foreground sm:text-2xl">{renderInline(block.text, k, returnPath)}</h2>;
          case "h3": return <h3 key={k} id={headingId(block.text)} className="mt-6 text-lg font-semibold text-foreground">{renderInline(block.text, k, returnPath)}</h3>;
          case "p": return <p key={k} className="mt-4 text-base leading-7 text-foreground">{renderInline(block.text, k, returnPath)}</p>;
          case "ul": return <ul key={k} className="mt-4 flex list-disc flex-col gap-2 pl-5 text-base leading-7 text-foreground">{block.items.map((item, j) => <li key={j}>{renderInline(item, `${k}-${j}`, returnPath)}</li>)}</ul>;
          case "ol": return <ol key={k} className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-base leading-7 text-foreground">{block.items.map((item, j) => <li key={j}>{renderInline(item, `${k}-${j}`, returnPath)}</li>)}</ol>;
          case "img": return <TripStoryFigure key={k} sha={block.sha} alt={block.alt} />;
          case "table": return (
            <div key={k} className="mt-4 overflow-x-auto rounded-2xl bg-surface shadow-surface">
              <table className="w-full text-left text-sm leading-6">
                <thead><tr>{block.head.map((h, j) => <th key={j} scope="col" className="px-3 py-2 font-semibold text-foreground">{renderInline(h, `${k}-h${j}`, returnPath)}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, r) => <tr key={r} className="even:bg-muted/30">{row.map((c, j) => <td key={j} className="px-3 py-2 align-top text-foreground">{renderInline(c, `${k}-${r}-${j}`, returnPath)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
      })}
    </>
  );
}
