/**
 * Schreibt Zahlen für die Sprachausgabe als deutsche Wörter aus (rein).
 * Pocket TTS spricht Ziffern nicht; Piper/espeak können es, schadet dort aber nicht.
 * Abgedeckt: Ganzzahlen, Dezimalzahlen, Tausenderpunkte, Uhrzeiten, Datumsangaben,
 * Ordinalzahlen, Jahreszahlen, Vorzeichen sowie °C, %, € und einige Einheiten.
 */

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober',
  'November', 'Dezember'];

function below100(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = Math.floor(n / 10), o = n % 10;
  if (o === 0) return TENS[t]!;
  return (o === 1 ? 'ein' : ONES[o]!) + 'und' + TENS[t]!;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const head = h === 0 ? '' : (h === 1 ? 'ein' : ONES[h]!) + 'hundert';
  if (r === 0) return head;
  return head + (r === 1 && h > 0 ? 'eins' : below100(r));
}

/** Kardinalzahl als Wort, z. B. 1234 -> "eintausendzweihundertvierunddreißig". */
export function numberToWords(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return String(n);
  if (n < 0) return 'minus ' + numberToWords(-n);
  if (n === 0) return 'null';
  if (n < 1000) return n === 1 ? 'eins' : below1000(n);
  const parts: string[] = [];
  const units: [number, string, string][] = [
    [1e12, 'Billion', 'Billionen'],
    [1e9, 'Milliarde', 'Milliarden'],
    [1e6, 'Million', 'Millionen'],
  ];
  let rest = n;
  for (const [v, sg, pl] of units) {
    const q = Math.floor(rest / v);
    if (q > 0) {
      parts.push(q === 1 ? `eine ${sg}` : `${numberToWords(q)} ${pl}`);
      rest -= q * v;
    }
  }
  let tail = '';
  const th = Math.floor(rest / 1000);
  if (th > 0) tail += (th === 1 ? 'ein' : below1000(th)) + 'tausend';
  const r = rest % 1000;
  if (r > 0) tail += r === 1 ? 'eins' : below1000(r);
  if (tail) parts.push(tail);
  return parts.join(' ');
}

/** Jahreszahl wie gesprochen: 1990 -> "neunzehnhundertneunzig", 2026 -> "zweitausendsechsundzwanzig". */
export function yearToWords(y: number): string {
  if (y >= 1100 && y < 2000) {
    const h = Math.floor(y / 100), r = y % 100;
    return below100(h) + 'hundert' + (r ? below100(r) : '');
  }
  return numberToWords(y);
}

/** Ordinalzahl mit Endung, z. B. (3, "ten") -> "dritten", (24, "te") -> "vierundzwanzigste". */
export function ordinalToWords(n: number, ending: 'te' | 'ten' | 'ter'): string {
  const special: Record<number, string> = { 1: 'ers', 3: 'drit', 7: 'sieb', 8: 'ach' };
  let stem: string;
  if (special[n]) stem = special[n]!;
  else if (n < 20) stem = numberToWords(n);
  else stem = numberToWords(n) + 's';
  return stem + ending;
}

const num = (s: string) => parseInt(s.replace(/\./g, ''), 10);

function decimal(intPart: string, frac: string): string {
  const head = numberToWords(num(intPart));
  const digits = frac.split('').map((d) => ONES[+d]!).join(' ');
  return `${head} Komma ${digits}`;
}

function ordinalEnding(before: string): 'te' | 'ten' {
  return /\b(?:der|die|das)\s*$/i.test(before) ? 'te' : 'ten';
}

export function speakNumbers(input: string): string {
  let t = input;

  // Datum 24.10.2026 / 24.10.
  t = t.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})?(?!\d)/g, (m, d: string, mo: string, y: string | undefined, off: number) => {
    const day = +d, month = +mo;
    if (day < 1 || day > 31 || month < 1 || month > 12) return m;
    const out = `${ordinalToWords(day, ordinalEnding(t.slice(0, off)))} ${MONTH_NAMES[month - 1]}`;
    return y ? `${out} ${yearToWords(+y)}` : out;
  });

  // Uhrzeit 7:30 / 07:05 Uhr / 14:00
  t = t.replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d,]|\.\d)(\s*Uhr)?/g, (m, h: string, mi: string, uhr: string | undefined) => {
    if (!uhr && m.includes('.')) return m; // 3.50 ohne "Uhr" ist eher Geld/Dezimal
    const hour = numberToWords(+h).replace(/^eins$/, 'ein');
    const minute = +mi === 0 ? '' : ' ' + numberToWords(+mi);
    return `${hour} Uhr${minute}`;
  });
  // "7 Uhr" -> "sieben Uhr" (eins -> ein)
  t = t.replace(/\b(\d{1,2})(\s*Uhr)\b/g, (_, h: string) => `${numberToWords(+h).replace(/^eins$/, 'ein')} Uhr`);

  // Ordinalzahl vor Monatsname: "24. Oktober"
  t = t.replace(new RegExp(`\\b(\\d{1,2})\\.\\s+(${MONTH_NAMES.join('|')}|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Nov|Dez)\\b`, 'g'),
    (_m, d: string, mon: string, off: number) => `${ordinalToWords(+d, ordinalEnding(t.slice(0, off)))} ${mon}`);

  // Geldbeträge: 5,50 € / 5 € / €5 / 12 EUR
  t = t.replace(/(?:€\s*)?(-?\d[\d.]*)(?:,(\d{1,2}))?\s*(?:€|EUR|Euro)/g, (m, e: string, c: string | undefined) => {
    if (!/€|EUR|Euro/.test(m)) return m;
    const euros = numberToWords(num(e)).replace(/^eins$/, 'ein');
    const cents = c ? ' ' + numberToWords(+c.padEnd(2, '0')) : '';
    return `${euros} Euro${cents}`;
  });

  // Temperaturen, Prozent, Einheiten
  const unit = (re: RegExp, word: string) => {
    t = t.replace(re, (_, v: string, f: string | undefined) => `${f ? decimal(v, f) : numberToWords(num(v))} ${word}`);
  };
  unit(/(-?\d[\d.]*)(?:,(\d+))?\s*°\s*C\b/g, 'Grad');
  unit(/(-?\d[\d.]*)(?:,(\d+))?\s*°/g, 'Grad');
  unit(/(-?\d[\d.]*)(?:,(\d+))?\s*%/g, 'Prozent');
  unit(/(-?\d[\d.]*)(?:,(\d+))?\s*km\/h\b/g, 'Kilometer pro Stunde');
  unit(/(-?\d[\d.]*)(?:,(\d+))?\s*km\b/g, 'Kilometer');
  unit(/(-?\d[\d.]*)(?:,(\d+))?\s*kg\b/g, 'Kilogramm');
  unit(/(-?\d[\d.]*)(?:,(\d+))?\s*kWh\b/g, 'Kilowattstunden');

  // Jahreszahlen 1900-2099 wie gesprochen
  t = t.replace(/\b(19\d\d|20\d\d)\b(?![.,]\d)/g, (_, y: string) => yearToWords(+y));

  // Dezimalzahlen 2,5
  t = t.replace(/(^|[^\d.,])(-?)(\d[\d.]*),(\d+)(?![\d,])/g, (_, pre: string, sign: string, i: string, f: string) =>
    `${pre}${sign ? 'minus ' : ''}${decimal(i, f)}`);

  // Ganzzahlen inkl. Tausenderpunkte (1.000, 10.000.000) und Vorzeichen
  t = t.replace(/(^|[^\p{L}\d.,])(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?![\d,])/gu, (_, pre: string, sign: string, n: string) =>
    `${pre}${sign ? 'minus ' : ''}${numberToWords(num(n))}`);

  return t;
}
