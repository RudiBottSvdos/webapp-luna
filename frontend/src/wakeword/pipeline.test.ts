import { describe, expect, it } from "vitest";
import { CHUNK, Resampler, WakeWordPipeline, rms, type WakeModels } from "./pipeline";

/** Attrappe: 8 Mel-Frames je Block, Embedding = Mittelwert, Klassifikator = letzter Wert. */
function fakeModels(log: { melInputs: number[]; embeds: number; classify: Float32Array[] }): WakeModels {
  return {
    mel: async (s) => {
      log.melInputs.push(s.length);
      return new Float32Array(8 * 32).fill(s[s.length - 1]! / 32767);
    },
    embed: async (w) => {
      log.embeds++;
      return new Float32Array(96).fill(w[w.length - 1]!);
    },
    classify: async (f) => {
      log.classify.push(f);
      return 0.9;
    },
  };
}

describe("WakeWordPipeline", () => {
  it("rechnet erst ab vollen 80-ms-Blöcken und gibt Vorlauf mit", async () => {
    const log = { melInputs: [] as number[], embeds: 0, classify: [] as Float32Array[] };
    const p = new WakeWordPipeline(fakeModels(log));
    expect(await p.push(new Float32Array(CHUNK - 1))).toEqual([]);
    expect(await p.push(new Float32Array(1))).toEqual([0]);
    await p.push(new Float32Array(CHUNK));
    expect(log.melInputs).toEqual([CHUNK, CHUNK + 480]);
  });

  it("braucht 76 Mel-Frames, 16 Embeddings und 5 Aufwärm-Vorhersagen", async () => {
    const log = { melInputs: [] as number[], embeds: 0, classify: [] as Float32Array[] };
    const p = new WakeWordPipeline(fakeModels(log));
    const scores = await p.push(new Float32Array(CHUNK * 40).fill(0.5));
    // Frame 76 ist nach Block 10 erreicht -> erstes Embedding bei Block 10, 16. bei Block 25
    expect(log.embeds).toBe(31);
    expect(scores.slice(0, 29).every((s) => s === 0)).toBe(true);
    expect(scores[29]).toBe(0.9);
    expect(log.classify[0]!.length).toBe(16 * 96);
  });

  it("wendet x/10+2 auf das Mel-Spektrogramm an", async () => {
    let window: Float32Array | null = null;
    const p = new WakeWordPipeline({
      mel: async () => new Float32Array(8 * 32).fill(10),
      embed: async (w) => {
        window = w;
        return new Float32Array(96);
      },
      classify: async () => 0,
    });
    await p.push(new Float32Array(CHUNK * 10));
    expect(window![0]).toBe(3);
  });

  it("reset leert die Puffer", async () => {
    const log = { melInputs: [] as number[], embeds: 0, classify: [] as Float32Array[] };
    const p = new WakeWordPipeline(fakeModels(log));
    await p.push(new Float32Array(CHUNK * 2));
    p.reset();
    await p.push(new Float32Array(CHUNK));
    expect(log.melInputs.at(-1)).toBe(CHUNK);
  });
});

describe("Resampler", () => {
  it("lässt 16 kHz unverändert", () => {
    const x = Float32Array.from([1, 2, 3]);
    expect(new Resampler(16000).push(x)).toBe(x);
  });
  it("rechnet 48 kHz auf ein Drittel der Länge um, auch über Blockgrenzen", () => {
    const r = new Resampler(48000);
    let n = 0;
    for (let i = 0; i < 10; i++) n += r.push(new Float32Array(480).fill(0.25)).length;
    expect(Math.abs(n - 1600)).toBeLessThanOrEqual(1);
  });
});

describe("rms", () => {
  it("berechnet den Effektivwert", () => {
    expect(rms(Float32Array.from([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});
