/**
 * Streaming-Satzsplitter (rein). Arbeitet auf Roh-Markdown; Zeilenumbrüche sind
 * Satzgrenzen, innerhalb von ```-Blöcken wird nie getrennt. Deutsche Abkürzungen,
 * Dezimalzahlen und Datumsangaben trennen nicht.
 */

const TERMINATORS = '.!?…';
const CLOSERS = ')"\'»«“”‘’]*_';

// Immer Abkürzung (kein Satzende), case-insensitive, ohne Punkt
const ABBREV = new Set([
  'dr', 'prof', 'nr', 'bzw', 'ca', 'vgl', 'evtl', 'ggf', 'ggfs', 'inkl', 'std', 'tel', 'str', 'mio', 'mrd',
  'abb', 'bspw', 'sog', 'geb', 'zzgl', 'bsp', 'allg', 'ehem', 'hrsg', 'kap', 'tab', 'jh', 'mr', 'mrs', 'ms', 'jr', 'sr',
]);
// Abkürzungen, die auch am Satzende stehen können: trennen nur vor Großbuchstaben
const SOFT_ABBREV = new Set(['usw', 'etc', 'uvm', 'usf']);
const MONTHS = ['jan', 'feb', 'mär', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'];

function nextWord(buf: string, from: number): string | undefined {
  let i = from;
  while (i < buf.length && /\s/.test(buf[i]!)) i++;
  if (i >= buf.length) return undefined;
  let j = i;
  while (j < buf.length && /[\p{L}\p{N}]/u.test(buf[j]!)) j++;
  return j === i ? buf[i]! : buf.slice(i, j);
}

/** true = Abkürzung (nicht trennen), false = Satzende, null = Lookahead fehlt noch */
function isAbbrev(buf: string, dot: number, after: number, final: boolean): boolean | null {
  let s = dot;
  while (s > 0 && !/[\s("'„»[]/.test(buf[s - 1]!)) s--;
  const token = buf.slice(s, dot);
  if (!token) return false;
  const lower = token.toLowerCase();

  if (/^\p{L}$/u.test(token)) return true; // "z." "B." "J."
  if (/^(?:\p{L}{1,2}\.)+\p{L}{1,2}$/u.test(token)) return true; // "z.B" "d.h" "u.a"
  if (ABBREV.has(lower)) return true;

  const soft = SOFT_ABBREV.has(lower);
  const numeric = /^\d{1,2}(?:\.\d{1,2})?$/.test(token);
  if (!soft && !numeric) return false;
  const nw = nextWord(buf, after);
  if (nw === undefined) return final ? false : null;

  if (soft) return !/^\p{Lu}/u.test(nw);
  // Ordinalzahl / Datum: weiter bei Kleinbuchstabe, Ziffer oder Monatsname
  if (/^[\p{Ll}\d]/u.test(nw)) return true;
  const nl = nw.toLowerCase();
  return MONTHS.some((m) => nl.startsWith(m));
}

/** Index direkt hinter dem ersten Satzende, -1 wenn (noch) keins feststeht. */
function findBoundary(buf: string, final: boolean): number {
  let inFence = false;
  for (let i = 0; i < buf.length; i++) {
    if (buf.startsWith('```', i)) {
      inFence = !inFence;
      i += 2;
      continue;
    }
    if (inFence) continue;
    const c = buf[i]!;
    if (c === '\n') return i + 1;
    if (!TERMINATORS.includes(c)) continue;

    let j = i;
    while (j + 1 < buf.length && TERMINATORS.includes(buf[j + 1]!)) j++;
    let k = j + 1;
    while (k < buf.length && CLOSERS.includes(buf[k]!)) k++;
    if (k >= buf.length) return -1; // Ende des Puffers: Rest holt flush()
    if (!/\s/.test(buf[k]!)) {
      i = k - 1; // "3.5", "a.b" ohne Leerraum
      continue;
    }
    if (c === '.' && j === i) {
      const ab = isAbbrev(buf, i, k, final);
      if (ab === null) return -1;
      if (ab) {
        i = k - 1;
        continue;
      }
    }
    return k;
  }
  return -1;
}

export class SentenceSplitter {
  private buf = '';

  push(text: string): string[] {
    this.buf += text;
    return this.drain(false);
  }

  flush(): string[] {
    const out = this.drain(true);
    if (this.buf.trim()) out.push(this.buf);
    this.buf = '';
    return out;
  }

  private drain(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const idx = findBoundary(this.buf, final);
      if (idx < 0) break;
      out.push(this.buf.slice(0, idx));
      this.buf = this.buf.slice(idx);
    }
    return out;
  }
}

export function splitSentences(text: string): string[] {
  const s = new SentenceSplitter();
  return [...s.push(text), ...s.flush()].map((x) => x.trim()).filter(Boolean);
}
