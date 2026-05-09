/**
 * Minimal block-level markdown parser used by the chat UI.
 *
 * The backend system prompt restricts the LLM to a small subset:
 *   - paragraphs (separated by blank lines)
 *   - bullet lists (lines starting with "- " or "* ")
 *   - **bold** spans inline
 *   - [N] citations inline
 *
 * We avoid pulling in `react-markdown` + remark just for this; the surface
 * is small enough to parse by hand, and that gives both web and mobile a
 * single shared renderer logic without dragging in a dep that isn't
 * compatible with React Native anyway.
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
      out.push({ kind: "bold", value: token.slice(2, -2) });
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

    // Collect a paragraph until a blank line or a bullet line
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
