// Plain-text twin of a built page (house footer link "Plain text"). Headings, paragraphs and list items from <main>, nothing else.
import { visibleText } from "./lib-gates.mjs";

export function plainTextTwin(html) {
  const title = visibleText((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ""])[1]);
  const main = (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || [, ""])[1];
  const lines = [];
  for (const m of main.matchAll(/<(h[1-3]|p|li|dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = visibleText(m[2]);
    if (!t) continue;
    const tag = m[1].toLowerCase();
    lines.push(tag === "h1" ? `# ${t}` : tag === "h2" ? `## ${t}` : tag === "h3" ? `### ${t}` : tag === "li" ? `- ${t}` : t);
  }
  return `# ${title}\n\n${lines.filter((l, i) => l !== lines[i - 1]).join("\n\n")}\n`;
}
