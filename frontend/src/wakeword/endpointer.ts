/**
 * Erkennt nach dem Weckwort, wann die Frage zu Ende ist (rein, nur Lautstärke):
 * Sprache = Pegel deutlich über dem Grundrauschen. Ende nach einer Sprechpause,
 * Abbruch, wenn gar nichts gesagt wird, und eine harte Obergrenze.
 */

export type EndpointResult = "continue" | "end" | "no-speech";

export interface EndpointOptions {
  chunkMs: number;
  silenceMs: number;
  noSpeechMs: number;
  maxMs: number;
  minThreshold: number;
  floorFactor: number;
}

export const DEFAULT_ENDPOINT: EndpointOptions = {
  chunkMs: 80,
  silenceMs: 1200,
  noSpeechMs: 6000,
  maxMs: 15000,
  minThreshold: 0.015,
  floorFactor: 3,
};

export class Endpointer {
  private elapsed = 0;
  private silence = 0;
  private spoke = false;
  private readonly o: EndpointOptions;

  constructor(
    private readonly noiseFloor: number,
    opts: Partial<EndpointOptions> = {},
  ) {
    this.o = { ...DEFAULT_ENDPOINT, ...opts };
  }

  get threshold(): number {
    return Math.max(this.o.minThreshold, this.noiseFloor * this.o.floorFactor);
  }

  feed(level: number): EndpointResult {
    this.elapsed += this.o.chunkMs;
    if (level >= this.threshold) {
      this.spoke = true;
      this.silence = 0;
    } else {
      this.silence += this.o.chunkMs;
    }
    if (this.elapsed >= this.o.maxMs) return this.spoke ? "end" : "no-speech";
    if (!this.spoke) return this.elapsed >= this.o.noSpeechMs ? "no-speech" : "continue";
    return this.silence >= this.o.silenceMs ? "end" : "continue";
  }
}

/** Gleitender Schätzwert für das Grundrauschen; laute Blöcke (Sprache) zählen kaum. */
export class NoiseFloor {
  private value: number | null = null;

  update(level: number): number {
    if (this.value === null) this.value = level;
    else {
      const rate = level > this.value * 2 ? 0.002 : 0.05;
      this.value += (level - this.value) * rate;
    }
    return this.value;
  }

  get current(): number {
    return this.value ?? 0;
  }
}
