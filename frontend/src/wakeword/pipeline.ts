/**
 * Streaming-Merkmalskette von openWakeWord (rein, Modelle werden hereingereicht):
 * 16-kHz-Audio in 80-ms-Blöcken -> Mel-Spektrogramm -> Embedding (96 Werte je Block)
 * -> Weckwort-Modell über die letzten 16 Embeddings. Entspricht openwakeword/utils.py
 * (AudioFeatures) und model.py (predict), damit die trainierten Modelle passen.
 */

export const SAMPLE_RATE = 16000;
export const CHUNK = 1280; // 80 ms
const MEL_CONTEXT = 160 * 3; // openWakeWord rechnet jeden Block mit 480 Samples Vorlauf
const MEL_BINS = 32;
const MEL_WINDOW = 76; // Mel-Frames pro Embedding
const EMB_DIM = 96;
const EMB_WINDOW = 16; // Embeddings pro Vorhersage
const WARMUP_PREDICTIONS = 5; // wie openWakeWord: die ersten Vorhersagen sind 0
const MAX_MEL_FRAMES = 970; // ~10 s, wie openWakeWord
const MAX_EMBEDDINGS = 120;

export interface WakeModels {
  /** int16-skalierte Samples -> Mel-Frames (frames * 32, roh, ohne x/10+2). */
  mel(samples: Float32Array): Promise<Float32Array>;
  /** 76 * 32 Mel-Werte -> 96 Werte. */
  embed(window: Float32Array): Promise<Float32Array>;
  /** 16 * 96 Werte -> Wahrscheinlichkeit 0..1. */
  classify(features: Float32Array): Promise<number>;
}

export class WakeWordPipeline {
  private pending: number[] = [];
  private raw = new Float32Array(0); // letzte Samples (für den Vorlauf)
  private mels: Float32Array[] = [];
  private embs: Float32Array[] = [];
  private predictions = 0;

  constructor(private readonly models: WakeModels) {}

  reset(): void {
    this.pending = [];
    this.raw = new Float32Array(0);
    this.mels = [];
    this.embs = [];
    this.predictions = 0;
  }

  /** Nimmt Samples im Bereich -1..1 an, liefert eine Wahrscheinlichkeit je vollem 80-ms-Block. */
  async push(samples: Float32Array): Promise<number[]> {
    for (const s of samples) this.pending.push(s);
    const scores: number[] = [];
    while (this.pending.length >= CHUNK) {
      const chunk = Float32Array.from(this.pending.splice(0, CHUNK), (s) => Math.round(Math.max(-1, Math.min(1, s)) * 32767));
      scores.push(await this.processChunk(chunk));
    }
    return scores;
  }

  private async processChunk(chunk: Float32Array): Promise<number> {
    const input = new Float32Array(this.raw.length + chunk.length);
    input.set(this.raw);
    input.set(chunk, this.raw.length);
    this.raw = input.slice(-MEL_CONTEXT);

    const mel = await this.models.mel(input);
    for (let f = 0; f + MEL_BINS <= mel.length; f += MEL_BINS) {
      this.mels.push(mel.slice(f, f + MEL_BINS).map((x) => x / 10 + 2));
    }
    if (this.mels.length > MAX_MEL_FRAMES) this.mels.splice(0, this.mels.length - MAX_MEL_FRAMES);
    if (this.mels.length < MEL_WINDOW) return 0;

    const win = new Float32Array(MEL_WINDOW * MEL_BINS);
    this.mels.slice(-MEL_WINDOW).forEach((frame, i) => win.set(frame, i * MEL_BINS));
    this.embs.push(await this.models.embed(win));
    if (this.embs.length > MAX_EMBEDDINGS) this.embs.splice(0, this.embs.length - MAX_EMBEDDINGS);
    if (this.embs.length < EMB_WINDOW) return 0;

    const feats = new Float32Array(EMB_WINDOW * EMB_DIM);
    this.embs.slice(-EMB_WINDOW).forEach((e, i) => feats.set(e, i * EMB_DIM));
    const score = await this.models.classify(feats);
    return ++this.predictions <= WARMUP_PREDICTIONS ? 0 : score;
  }
}

/** Einfache lineare Umrechnung auf 16 kHz, falls der Browser die Abtastrate nicht selbst anpasst. */
export class Resampler {
  private pos = 0; // Leseposition relativ zum Anfang von `carry`
  private carry = new Float32Array(0);

  constructor(private readonly fromRate: number) {}

  push(input: Float32Array): Float32Array {
    if (this.fromRate === SAMPLE_RATE) return input;
    const buf = new Float32Array(this.carry.length + input.length);
    buf.set(this.carry);
    buf.set(input, this.carry.length);
    const step = this.fromRate / SAMPLE_RATE;
    const out: number[] = [];
    while (this.pos + 1 < buf.length) {
      const i = Math.floor(this.pos);
      const t = this.pos - i;
      out.push(buf[i]! * (1 - t) + buf[i + 1]! * t);
      this.pos += step;
    }
    const keep = Math.floor(this.pos);
    this.carry = buf.slice(keep);
    this.pos -= keep;
    return Float32Array.from(out);
  }
}

/** Effektivwert eines Blocks (-1..1). */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}
