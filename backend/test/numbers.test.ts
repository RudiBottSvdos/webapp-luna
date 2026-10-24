import { describe, expect, it } from 'vitest';
import { numberToWords, ordinalToWords, speakNumbers, yearToWords } from '../src/speech/numbers.js';

describe('numberToWords', () => {
  it.each([
    [0, 'null'], [1, 'eins'], [7, 'sieben'], [16, 'sechzehn'], [21, 'einundzwanzig'], [30, 'dreißig'],
    [101, 'einhunderteins'], [118, 'einhundertachtzehn'], [1000, 'eintausend'], [1234, 'eintausendzweihundertvierunddreißig'],
    [2026, 'zweitausendsechsundzwanzig'], [1000000, 'eine Million'], [2500000, 'zwei Millionen fünfhunderttausend'], [-5, 'minus fünf'],
  ])('%i -> %s', (n, w) => expect(numberToWords(n)).toBe(w));
});

describe('Jahre und Ordinalzahlen', () => {
  it('Jahre', () => {
    expect(yearToWords(1990)).toBe('neunzehnhundertneunzig');
    expect(yearToWords(2026)).toBe('zweitausendsechsundzwanzig');
  });
  it('Ordinalzahlen', () => {
    expect(ordinalToWords(1, 'ten')).toBe('ersten');
    expect(ordinalToWords(3, 'te')).toBe('dritte');
    expect(ordinalToWords(24, 'ten')).toBe('vierundzwanzigsten');
  });
});

describe('speakNumbers', () => {
  it.each([
    ['Morgen werden es 18 °C.', 'Morgen werden es achtzehn Grad.'],
    ['Es sind -3° draußen.', 'Es sind minus drei Grad draußen.'],
    ['Ich wecke dich um 7:30 Uhr.', 'Ich wecke dich um sieben Uhr dreißig.'],
    ['Es ist 14:05.', 'Es ist vierzehn Uhr fünf.'],
    ['Treffen um 1 Uhr.', 'Treffen um ein Uhr.'],
    ['Das kostet 5,50 €.', 'Das kostet fünf Euro fünfzig.'],
    ['Das kostet 1 €.', 'Das kostet ein Euro.'],
    ['Die Quote liegt bei 12,5 %.', 'Die Quote liegt bei zwölf Komma fünf Prozent.'],
    ['Am 24. Oktober ist Markt.', 'Am vierundzwanzigsten Oktober ist Markt.'],
    ['Der 3. Mai ist ein Freitag.', 'Der dritte Mai ist ein Freitag.'],
    ['Geboren am 24.10.1990.', 'Geboren am vierundzwanzigsten Oktober neunzehnhundertneunzig.'],
    ['Im Jahr 2026 gibt es 10.000 Einwohner.', 'Im Jahr zweitausendsechsundzwanzig gibt es zehntausend Einwohner.'],
    ['Fahr maximal 50 km/h.', 'Fahr maximal fünfzig Kilometer pro Stunde.'],
    ['Es sind 3 Termine.', 'Es sind drei Termine.'],
    ['Ohne Zahlen bleibt alles gleich.', 'Ohne Zahlen bleibt alles gleich.'],
  ])('%s', (input, out) => expect(speakNumbers(input)).toBe(out));
});
