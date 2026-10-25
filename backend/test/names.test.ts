import { describe, expect, it } from 'vitest';
import { speakNames } from '../src/speech/names.js';

describe('speakNames', () => {
  it('spricht F.R.I.D.A.Y. als Friday', () => {
    expect(speakNames('Ich bin F.R.I.D.A.Y.')).toBe('Ich bin Friday');
    expect(speakNames('F.R.I.D.A.Y. hier, was gibt es?')).toBe('Friday hier, was gibt es?');
    expect(speakNames('Hallo Rudi.')).toBe('Hallo Rudi.');
  });
});
