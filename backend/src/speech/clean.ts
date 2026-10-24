/**
 * Bereinigt Markdown-Text fürs Vorlesen (rein, ohne Seiteneffekte).
 * - Fenced Code-Blöcke werden komplett entfernt (auch unterminierte)
 * - Inline-Code entfällt, Links -> Label, nackte URLs entfallen
 * - Überschriften-/Listen-/Zitat-Marker, Hervorhebungen und Emoji entfallen
 */

const EMOJI =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|[︎️‍⃣]|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]/gu;

const ESC = '\\`*_{}[]()#+-.!|>~'; // 20 Zeichen -> U+E000..U+E013

export function cleanForSpeech(input: string): string {
  let t = input.replace(/\r\n?/g, '\n');

  // Fenced Code (``` oder ~~~), inkl. unterminierter Blöcke bis Textende
  t = removeFences(t);

  // Inline-Code
  t = t.replace(/``[^`]*``/g, '').replace(/`[^`\n]*`/g, '');
  // Bilder entfernen, Links -> Label
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  // Autolinks <https://...> und HTML-Tags
  t = t.replace(/<(?:https?:\/\/|www\.)[^>\s]*>/gi, '');
  t = t.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  // Nackte URLs
  t = t.replace(/\b(?:https?:\/\/|www\.)[^\s)>\]]+/gi, '');

  // Markdown-Escapes (\* etc.) vor der Marker-Entfernung schützen (Private-Use-Zeichen)
  t = t.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_, ch: string) => String.fromCharCode(0xe000 + ESC.indexOf(ch)));

  // Zeilenmarker
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
  t = t.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '');
  t = t.replace(/^[ \t]*>+[ \t]?/gm, '');
  t = t.replace(/^[ \t]*[-*+•][ \t]+(?:\[[ xX]\][ \t]+)?/gm, '');
  // Tabellen: Trennzeilen weg, Pipes -> Komma
  t = t.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '');
  t = t.replace(/^[ \t]*\|[ \t]*/gm, '').replace(/[ \t]*\|[ \t]*$/gm, '').replace(/[ \t]*\|[ \t]*/g, ', ');

  // Hervorhebungen (zweimal, wegen Verschachtelung)
  for (let i = 0; i < 2; i++) {
    t = t.replace(/(\*\*\*|\*\*|\*)(?=\S)([^\n]*?\S)\1/g, '$2');
    t = t.replace(/(?<![\p{L}\p{N}_])(___|__|_)(?=\S)([^\n]*?\S)\1(?![\p{L}\p{N}_])/gu, '$2');
    t = t.replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1');
  }
  // verwaiste Marker
  t = t.replace(/\*{1,3}|~~/g, '');

  // Emoji
  t = t.replace(EMOJI, '');

  // geschützte Escapes zurückholen
  t = t.replace(/[-]/g, (ch) => ESC[ch.charCodeAt(0) - 0xe000]!);

  // Whitespace
  t = t.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
  t = t
    .replace(/\n/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[,;:\s]+/, '')
    .trim();

  // Nichts Sprechbares übrig?
  if (!/[\p{L}\p{N}]/u.test(t)) return '';
  return t;
}

/** Entfernt ```/~~~-Blöcke zeilenweise; ein offener Block läuft bis zum Textende. */
function removeFences(text: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of text.split('\n')) {
    const m = /^[ \t]*(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m) fence = m[1]![0]!.repeat(m[1]!.length);
      else out.push(line);
    } else if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length && /^[ \t]*[`~]+[ \t]*$/.test(line)) {
      fence = null;
    }
  }
  return out.join('\n');
}
