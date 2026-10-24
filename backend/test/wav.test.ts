import { describe, expect, it } from 'vitest';
import { fixWavSizes } from '../src/speech/wav.js';

function wav(dataLen: number, placeholder: number): Buffer {
  const b = Buffer.alloc(44 + dataLen);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(placeholder + 36, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(placeholder, 40);
  return b;
}

describe('fixWavSizes', () => {
  it('ersetzt Platzhalter-Längen durch die echte Größe', () => {
    const b = fixWavSizes(wav(100, 2_000_000_000));
    expect(b.readUInt32LE(4)).toBe(136);
    expect(b.readUInt32LE(40)).toBe(100);
  });

  it('lässt Nicht-WAV-Daten unverändert', () => {
    const b = Buffer.from([1, 2, 3]);
    expect(fixWavSizes(b)).toEqual(Buffer.from([1, 2, 3]));
  });
});
