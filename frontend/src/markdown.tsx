import type { ReactNode } from "react";

/** Tiny, safe markdown renderer: produces React elements only (no HTML injection). */
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\([^)\s]+\))/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+/;

export function renderInline(src: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = src;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}${n++}`;
    if (m[1]) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (m[2] || m[3]) out.push(<strong key={key}>{renderInline(tok.slice(2, -2), key)}</strong>);
    else if (m[4]) out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      if (/^https?:\/\//i.test(lm[2])) {
        out.push(
          <a key={key} href={lm[2]} target="_blank" rel="noopener noreferrer">
            {lm[1]}
          </a>,
        );
      } else out.push(lm[1]);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const isFence = (l: string) => l.trimStart().startsWith("```");
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
    } else if (isFence(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k++}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const re = BULLET.test(line) ? BULLET : NUMBERED;
      const items: ReactNode[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(<li key={items.length}>{renderInline(re.exec(lines[i])![1], `l${k}-${items.length}-`)}</li>);
        i++;
      }
      blocks.push(re === BULLET ? <ul key={k++}>{items}</ul> : <ol key={k++}>{items}</ol>);
    } else if (HEADING.test(line)) {
      blocks.push(
        <p key={k++}>
          <strong>{renderInline(line.replace(HEADING, ""), `h${k}-`)}</strong>
        </p>,
      );
      i++;
    } else {
      const nodes: ReactNode[] = [];
      let idx = 0;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !isFence(lines[i]) &&
        !BULLET.test(lines[i]) &&
        !NUMBERED.test(lines[i]) &&
        !HEADING.test(lines[i])
      ) {
        if (idx > 0) nodes.push(<br key={`br${idx}`} />);
        nodes.push(...renderInline(lines[i], `p${k}-${idx}-`));
        idx++;
        i++;
      }
      blocks.push(<p key={k++}>{nodes}</p>);
    }
  }
  return <>{blocks}</>;
}
