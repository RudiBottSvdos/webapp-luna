import { describe, expect, it } from 'vitest';
import { SentenceSplitter, splitSentences as s } from '../src/speech/sentences.js';

describe('splitSentences', () => {
  it('trennt einfache Sätze', () => {
    expect(s('Hallo Welt. Wie geht es dir? Gut! Danke.')).toEqual(['Hallo Welt.', 'Wie geht es dir?', 'Gut!', 'Danke.']);
  });
  it('trennt an Zeilenumbrüchen (Listen, Überschriften)', () => {
    expect(s('# Titel\n- eins\n- zwei\nEnde.')).toEqual(['# Titel', '- eins', '- zwei', 'Ende.']);
  });
  it('trennt nicht bei z. B. / d. h. / u. a.', () => {
    expect(s('Das ist z. B. ein Test. Fertig.')).toEqual(['Das ist z. B. ein Test.', 'Fertig.']);
    expect(s('Es gilt d. h. alles. Ja.')).toEqual(['Es gilt d. h. alles.', 'Ja.']);
    expect(s('Das gilt z.B. hier. Ja.')).toEqual(['Das gilt z.B. hier.', 'Ja.']);
    expect(s('Unter u. a. Strom. Ja.')).toEqual(['Unter u. a. Strom.', 'Ja.']);
  });
  it('trennt nicht bei usw./bzw. vor Kleinbuchstaben', () => {
    expect(s('Äpfel, Birnen usw. sind gesund. Ja.')).toEqual(['Äpfel, Birnen usw. sind gesund.', 'Ja.']);
    expect(s('A bzw. B ist gemeint. Ja.')).toEqual(['A bzw. B ist gemeint.', 'Ja.']);
  });
  it('trennt bei usw. vor Großbuchstaben (Satzende)', () => {
    expect(s('Äpfel, Birnen usw. Dann gehen wir.')).toEqual(['Äpfel, Birnen usw.', 'Dann gehen wir.']);
  });
  it('trennt nicht nach Titeln und Nr.', () => {
    expect(s('Dr. Müller kommt. Prof. Schmidt auch.')).toEqual(['Dr. Müller kommt.', 'Prof. Schmidt auch.']);
    expect(s('Siehe Nr. 5 oben. Gut.')).toEqual(['Siehe Nr. 5 oben.', 'Gut.']);
  });
  it('trennt nicht bei Dezimalzahlen', () => {
    expect(s('Es sind 3.5 Grad. Kalt.')).toEqual(['Es sind 3.5 Grad.', 'Kalt.']);
  });
  it('trennt nicht bei Datum / Ordinalzahlen', () => {
    expect(s('Am 24.10. kommt er. Gut.')).toEqual(['Am 24.10. kommt er.', 'Gut.']);
    expect(s('Am 3. Mai ist es so. Gut.')).toEqual(['Am 3. Mai ist es so.', 'Gut.']);
    expect(s('Der 24.10.2026 ist ein Tag. Gut.')).toEqual(['Der 24.10.2026 ist ein Tag.', 'Gut.']);
  });
  it('trennt nach Zahl am echten Satzende', () => {
    expect(s('Ich zähle bis 5. Dann gehe ich.')).toEqual(['Ich zähle bis 5.', 'Dann gehe ich.']);
  });
  it('behandelt Auslassungspunkte und Anführungszeichen', () => {
    expect(s('Hmm... Das stimmt. "Ja." Ende.')).toEqual(['Hmm...', 'Das stimmt.', '"Ja."', 'Ende.']);
  });
  it('trennt nicht innerhalb von Code-Blöcken', () => {
    expect(s('Vorher.\n```\na. b. c.\nzeile 2\n```\nNachher.')).toEqual([
      'Vorher.',
      '```\na. b. c.\nzeile 2\n```',
      'Nachher.',
    ]);
  });
  it('trennt nicht bei URLs/Dateinamen', () => {
    expect(s('Öffne example.com jetzt. Ok.')).toEqual(['Öffne example.com jetzt.', 'Ok.']);
  });
  it('liefert den Rest ohne Satzzeichen', () => {
    expect(s('Ein Satz. Und ein Rest')).toEqual(['Ein Satz.', 'Und ein Rest']);
  });
  it('liefert leer bei leerem Input', () => {
    expect(s('')).toEqual([]);
    expect(s('  \n \n')).toEqual([]);
  });
});

describe('SentenceSplitter (Streaming)', () => {
  it('liefert Sätze erst, wenn sie feststehen', () => {
    const sp = new SentenceSplitter();
    expect(sp.push('Hallo')).toEqual([]);
    expect(sp.push(' Welt.')).toEqual([]); // Lookahead fehlt noch
    expect(sp.push(' Wie')).toEqual(['Hallo Welt.']);
    expect(sp.push(' geht es?')).toEqual([]);
    expect(sp.flush().map((x) => x.trim())).toEqual(['Wie geht es?']);
  });
  it('wartet bei Zahl+Punkt auf das nächste Wort', () => {
    const sp = new SentenceSplitter();
    expect(sp.push('Am 3. ')).toEqual([]);
    expect(sp.push('Mai ist es. Dann')).toEqual(['Am 3. Mai ist es.']);
  });
  it('ergibt bei beliebiger Chunk-Größe dasselbe wie am Stück', () => {
    const text = 'Das ist z. B. ein Test. Am 24.10. kommt Dr. Müller! Es sind 3.5 Grad...\n- Punkt eins\n```\nx. y.\n```\nEnde';
    const sp = new SentenceSplitter();
    const out: string[] = [];
    for (const ch of text) out.push(...sp.push(ch));
    out.push(...sp.flush());
    expect(out.map((x) => x.trim()).filter(Boolean)).toEqual(s(text));
  });
  it('flush ist idempotent', () => {
    const sp = new SentenceSplitter();
    sp.push('Rest');
    expect(sp.flush()).toEqual(['Rest']);
    expect(sp.flush()).toEqual([]);
  });
});
