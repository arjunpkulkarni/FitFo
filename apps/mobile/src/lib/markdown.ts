/**
 * Same minimal markdown parser as apps/web/src/lib/markdown.ts.
 *
 * Kept separate so the two apps don't have to share a build target. The
 * surface is small enough that drift is cheap to spot in code review.
 *
 * Supported subset (matches what the chat system prompt produces):
 *   - paragraphs (separated by blank lines)
 *   - bullet lists (`- ` / `* `)
 *   - **bold** spans
 *   - [N] inline citations
 */

export type MarkdownInline =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "citation"; index: number };

export type MarkdownBlock =
  | { kind: "paragraph"; inlines: MarkdownInline[] }
  | { kind: "bullet_list"; items: MarkdownInline[][] };

const BOLD_OR_CITATION = /(\*\*[^*]+\*\*|\[\d+\])/g;
const BULLET_RE = /^[-*]\s+(.*)$/;

function tokenizeInline(text: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(BOLD_OR_CITATION)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      out.push({ kind: "text", value: text.slice(lastIndex, start) });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      const inner = token.slice(2, -2);
      const wrappedCite = /^\[(\d+)\]$/.exec(inner);
      if (wrappedCite) {
        const num = Number(wrappedCite[1]);
        if (Number.isFinite(num)) {
          out.push({ kind: "citation", index: num });
        } else {
          out.push({ kind: "bold", value: inner });
        }
      } else {
        out.push({ kind: "bold", value: inner });
      }
    } else {
      const num = Number(token.slice(1, -1));
      if (Number.isFinite(num)) {
        out.push({ kind: "citation", index: num });
      } else {
        out.push({ kind: "text", value: token });
      }
    }
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) {
    out.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return out;
}

export function parseMarkdown(input: string): MarkdownBlock[] {
  const trimmed = (input || "").trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const bulletMatch = line.match(BULLET_RE);
    if (bulletMatch) {
      const items: MarkdownInline[][] = [];
      while (i < lines.length) {
        const m = lines[i].match(BULLET_RE);
        if (!m) break;
        items.push(tokenizeInline(m[1]));
        i += 1;
      }
      blocks.push({ kind: "bullet_list", items });
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const peek = lines[i];
      if (peek.trim() === "") break;
      if (BULLET_RE.test(peek)) break;
      para.push(peek);
      i += 1;
    }
    blocks.push({ kind: "paragraph", inlines: tokenizeInline(para.join(" ")) });
  }

  return blocks;
}
