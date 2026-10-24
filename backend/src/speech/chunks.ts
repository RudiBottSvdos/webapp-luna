/**
 * Teilt einen langen Satz für die Sprachausgabe an Satzzeichen in kürzere Stücke (rein).
 * Kurze Stücke sind schneller erzeugt; das erste Stück erklingt dadurch früher, und das
 * nächste entsteht, während das vorige noch abgespielt wird. Der angezeigte Text bleibt gleich.
 */
const MIN_CHUNK = 25;
const MAX_CHUNK = 90;

export function chunkForSpeech(sentence: string, maxLen = MAX_CHUNK): string[] {
  const s = sentence.trim();
  if (s.length <= maxLen) return s ? [s] : [];
  const parts = s.split(/(?<=[,;:–—])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (!cur) cur = p;
    else if (cur.length < MIN_CHUNK || cur.length + 1 + p.length <= maxLen) cur += ' ' + p;
    else {
      out.push(cur);
      cur = p;
    }
  }
  if (cur) {
    if (cur.length < MIN_CHUNK && out.length) out[out.length - 1] += ' ' + cur;
    else out.push(cur);
  }
  return out;
}
