// No imports: the spot card uses this in client chunks (map view) too.
/** Markdown links in imported descriptions ("[Venue guide](url)") move to the page-end sources list. */
export function splitDescriptionLinks(description: string): { text: string; links: { title: string; url: string }[] } {
  const links: { title: string; url: string }[] = [];
  const text = description
    .replace(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/g, (_match, title: string, url: string) => {
      links.push({ title: title.trim(), url });
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text, links };
}
