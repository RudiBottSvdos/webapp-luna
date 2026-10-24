import { describe, expect, it } from 'vitest';
import { cleanForSpeech as c } from '../src/speech/clean.js';

describe('cleanForSpeech', () => {
  it('entfernt Überschriften', () => {
    expect(c('## Wetter heute')).toBe('Wetter heute');
    expect(c('# Titel')).toBe('Titel');
  });
  it('entfernt Aufzählungszeichen', () => {
    expect(c('- Milch')).toBe('Milch');
    expect(c('* Brot')).toBe('Brot');
    expect(c('+ Eier')).toBe('Eier');
    expect(c('• Käse')).toBe('Käse');
  });
  it('entfernt Hervorhebungen', () => {
    expect(c('Das ist **wichtig** und *kursiv* und __fett__ und _schief_ und ~~weg~~.')).toBe(
      'Das ist wichtig und kursiv und fett und schief und weg.',
    );
    expect(c('***sehr***')).toBe('sehr');
  });
  it('lässt snake_case in Ruhe', () => {
    expect(c('Die Variable foo_bar_baz ist gesetzt.')).toBe('Die Variable foo_bar_baz ist gesetzt.');
  });
  it('entfernt Inline-Code', () => {
    expect(c('Nutze `npm install` dafür.')).toBe('Nutze dafür.');
  });
  it('entfernt Code-Blöcke komplett', () => {
    expect(c('Vorher\n```js\nconst a = 1;\nconsole.log(a);\n```\nNachher')).toBe('Vorher Nachher');
    expect(c('```\nnur code\n```')).toBe('');
  });
  it('entfernt unterminierte Code-Blöcke', () => {
    expect(c('Text\n```py\nprint(1)')).toBe('Text');
  });
  it('reduziert Links auf das Label', () => {
    expect(c('Siehe [die Doku](https://example.com/doc) hier.')).toBe('Siehe die Doku hier.');
    expect(c('[Label][ref]')).toBe('Label');
  });
  it('entfernt Bilder', () => {
    expect(c('Bild ![Alt](http://x.de/a.png) Ende')).toBe('Bild Ende');
  });
  it('entfernt nackte URLs', () => {
    expect(c('Mehr unter https://example.com/pfad?x=1 und www.test.de ok')).toBe('Mehr unter und ok');
  });
  it('entfernt Emoji', () => {
    expect(c('Hallo 😀 Welt 👍🏽 ❤️ 🇩🇪!')).toBe('Hallo Welt !'.replace(' !', '!'));
  });
  it('behält Ziffern', () => {
    expect(c('Es sind 3 Grad.')).toBe('Es sind 3 Grad.');
    expect(c('1️⃣ Eins')).toBe('1 Eins');
  });
  it('entfernt Zitat-Marker und Trennlinien', () => {
    expect(c('> Zitat')).toBe('Zitat');
    expect(c('---')).toBe('');
  });
  it('wandelt Tabellen in Fließtext', () => {
    expect(c('| A | B |\n|---|---|\n| 1 | 2 |')).toBe('A, B 1, 2');
  });
  it('gibt leeren String bei reinen Symbolen', () => {
    expect(c('   ')).toBe('');
    expect(c('😀')).toBe('');
    expect(c('**')).toBe('');
  });
  it('entfernt HTML-Tags und Escapes', () => {
    expect(c('Hallo <b>Welt</b> \\* Stern')).toBe('Hallo Welt * Stern');
  });
  it('kollabiert Whitespace', () => {
    expect(c('a   b\n\n\nc')).toBe('a b c');
  });
});
