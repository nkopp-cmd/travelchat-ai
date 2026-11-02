import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Small Markdown renderer for our own blog posts: ## / ### headings, paragraphs,
 * "-" and "1." lists, pipe tables, **bold**, *italic*, `code` and [links](url).
 * No raw HTML: the source is text only, so React escapes everything.
 */
type Block =
  | { type: "h2" | "h3" | "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
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
    while (i < lines.length && lines[i].trim() && !/^(#{2,3} |- |\d+\. |\|)/.test(lines[i])) text.push(lines[i++].trim());
    blocks.push({ type: "p", text: text.join(" ") });
  }
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function renderInline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) out.push(<strong key={k} className="font-semibold">{renderInline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{renderInline(m[2], k)}</em>);
    else if (m[3] !== undefined) out.push(<code key={k} className="rounded bg-raised px-1">{m[3]}</code>);
    else {
      const href = m[5];
      const label = renderInline(m[4], k);
      if (href.startsWith("/")) out.push(<Link key={k} href={href} prefetch={false} className="font-semibold text-primary underline underline-offset-2">{label}</Link>);
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

export function BlogMarkdown({ source }: { source: string }) {
  return (
    <>
      {parseBlocks(source).map((block, i) => {
        const k = `b${i}`;
        switch (block.type) {
          case "h2": return <h2 key={k} id={headingId(block.text)} className="mt-10 text-xl font-bold text-foreground sm:text-2xl">{renderInline(block.text, k)}</h2>;
          case "h3": return <h3 key={k} id={headingId(block.text)} className="mt-6 text-lg font-semibold text-foreground">{renderInline(block.text, k)}</h3>;
          case "p": return <p key={k} className="mt-4 text-base leading-7 text-foreground">{renderInline(block.text, k)}</p>;
          case "ul": return <ul key={k} className="mt-4 flex list-disc flex-col gap-2 pl-5 text-base leading-7 text-foreground">{block.items.map((item, j) => <li key={j}>{renderInline(item, `${k}-${j}`)}</li>)}</ul>;
          case "ol": return <ol key={k} className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-base leading-7 text-foreground">{block.items.map((item, j) => <li key={j}>{renderInline(item, `${k}-${j}`)}</li>)}</ol>;
          case "table": return (
            <div key={k} className="mt-4 overflow-x-auto rounded-2xl bg-surface shadow-surface">
              <table className="w-full text-left text-sm leading-6">
                <thead><tr>{block.head.map((h, j) => <th key={j} scope="col" className="px-3 py-2 font-semibold text-foreground">{renderInline(h, `${k}-h${j}`)}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, r) => <tr key={r} className="even:bg-muted/30">{row.map((c, j) => <td key={j} className="px-3 py-2 align-top text-foreground">{renderInline(c, `${k}-${r}-${j}`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
      })}
    </>
  );
}
