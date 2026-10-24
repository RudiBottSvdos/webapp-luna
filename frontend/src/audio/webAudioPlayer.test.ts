import { describe, expect, it } from "vitest";
import { WavStreamParser } from "./webAudioPlayer";

function wavHeader(sampleRate: number, channels: number, placeholder = 0x7fffffff): Uint8Array {
  const b = new Uint8Array(44);
  const v = new DataView(b.buffer);
  const put = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
  put(0, "RIFF");
  v.setUint32(4, placeholder, true);
  put(8, "WAVE");
  put(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  put(36, "data");
  v.setUint32(40, placeholder, true);
  return b;
}

function pcm(samples: number[]): Uint8Array {
  const b = new Uint8Array(samples.length * 2);
  const v = new DataView(b.buffer);
  samples.forEach((s, i) => v.setInt16(i * 2, s, true));
  return b;
}

describe("WavStreamParser", () => {
  it("liest Header und Samples auch bei Platzhalter-Längen", () => {
    const p = new WavStreamParser();
    const out = p.push(new Uint8Array([...wavHeader(24000, 1), ...pcm([0, 16384, -32768])]));
    expect(p.sampleRate).toBe(24000);
    expect(out).toHaveLength(1);
    expect([...out[0]!]).toEqual([0, 0.5, -1]);
  });

  it("verkraftet Header und Samples, die auf mehrere Stücke verteilt sind", () => {
    const p = new WavStreamParser();
    const all = new Uint8Array([...wavHeader(16000, 1), ...pcm([100, 200, 300])]);
    expect(p.push(all.subarray(0, 20))).toEqual([]);
    expect(p.push(all.subarray(20, 45))).toEqual([]); // Header fertig, ein halbes Sample
    const out = p.push(all.subarray(45));
    expect(out[0]!.length).toBe(3);
    expect(Math.round(out[0]![2]! * 32768)).toBe(300);
  });

  it("trennt Stereo in Kanäle", () => {
    const p = new WavStreamParser();
    const out = p.push(new Uint8Array([...wavHeader(24000, 2), ...pcm([1, 2, 3, 4])]));
    expect(out).toHaveLength(2);
    expect(out[0]!.length).toBe(2);
  });

  it("lehnt Nicht-WAV ab", () => {
    expect(() => new WavStreamParser().push(new TextEncoder().encode("ID3 kein wav daten"))).toThrow();
  });
});
