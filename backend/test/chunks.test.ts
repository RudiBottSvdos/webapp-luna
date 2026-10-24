import { describe, expect, it } from 'vitest';
import { chunkForSpeech } from '../src/speech/chunks.js';

describe('chunkForSpeech', () => {
  it('lässt kurze Sätze unverändert', () => {
    expect(chunkForSpeech('Ich bin Luna.')).toEqual(['Ich bin Luna.']);
  });
  it('teilt lange Sätze an Kommas', () => {
    const s =
      'Morgen wird es in Berlin überwiegend sonnig, mit Temperaturen um achtzehn Grad und leichtem Wind aus Westen, am Nachmittag ziehen einzelne Wolken auf.';
    const c = chunkForSpeech(s);
    expect(c.length).toBeGreaterThan(1);
    expect(c.join(' ')).toBe(s);
    for (const x of c) expect(x.length).toBeLessThanOrEqual(90);
  });
  it('hängt sehr kurze Reste an das vorige Stück', () => {
    const s = 'Das ist ein ziemlich langer erster Teil des Satzes, der weitergeht und weitergeht und weitergeht, ja.';
    const c = chunkForSpeech(s);
    expect(c[c.length - 1]!.endsWith('ja.')).toBe(true);
    expect(c.every((x) => x.length >= 25)).toBe(true);
  });
  it('lässt Sätze ohne Satzzeichen ganz', () => {
    const s = 'a'.repeat(120);
    expect(chunkForSpeech(s)).toEqual([s]);
  });
});
