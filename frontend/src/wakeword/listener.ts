import { loadWakeModels } from "./models";
import { NoiseFloor } from "./endpointer";
import { Resampler, SAMPLE_RATE, WakeWordPipeline, rms } from "./pipeline";

const BASE = "/wakeword/";
export const WAKE_MODEL = `${BASE}friday.onnx`;
const THRESHOLD = 0.5;
const COOLDOWN_MS = 2000;
const ARM_DELAY_MS = 1500; // nach dem Scharfschalten: alten Puffer (z. B. eigene Sprachausgabe) nicht werten
const MAX_BACKLOG = 6;

export interface WakeListenerEvents {
  onWake: () => void;
  /** Pegel jedes 80-ms-Blocks samt geschätztem Grundrauschen (für das Sprechende). */
  onLevel: (level: number, noiseFloor: number) => void;
}

/**
 * Hört dauerhaft auf dem Mikrofon-Stream mit und meldet das Weckwort. Alles läuft lokal
 * im Browser; nur scharf geschaltet (armed) löst es aus.
 */
export class WakeListener {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private pipeline: WakeWordPipeline | null = null;
  private resampler: Resampler | null = null;
  private readonly floor = new NoiseFloor();
  private armed = false;
  private armedAt = 0;
  private lastWake = 0;
  private busy: Promise<void> = Promise.resolve();
  private backlog = 0;

  constructor(private readonly events: WakeListenerEvents) {}

  get suspended(): boolean {
    return this.ctx?.state === "suspended";
  }

  async start(stream: MediaStream): Promise<void> {
    if (this.ctx) return;
    const models = await loadWakeModels({
      mel: `${BASE}melspectrogram.onnx`,
      embed: `${BASE}embedding_model.onnx`,
      wake: WAKE_MODEL,
    });
    this.pipeline = new WakeWordPipeline(models);
    // Chrome rechnet das Mikrofon selbst auf 16 kHz um; sonst übernimmt der Resampler.
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.ctx = ctx;
    this.resampler = new Resampler(ctx.sampleRate);
    await ctx.audioWorklet.addModule(`${BASE}capture-worklet.js`);
    this.source = ctx.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(ctx, "friday-capture");
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onSamples(e.data);
    // Stumm an den Ausgang hängen, damit der Browser den Knoten sicher verarbeitet.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.source.connect(this.node).connect(mute).connect(ctx.destination);
  }

  /** Muss aus einer Nutzergeste kommen, falls der Browser den Kontext angehalten hat. */
  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  setArmed(on: boolean): void {
    if (on && !this.armed) this.armedAt = performance.now();
    this.armed = on;
  }

  /** Kurzer Bestätigungston nach dem Weckwort. */
  beep(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  stop(): void {
    this.node?.port.close();
    this.source?.disconnect();
    this.node?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.node = null;
    this.source = null;
    this.pipeline = null;
  }

  private onSamples(raw: Float32Array): void {
    const samples = this.resampler ? this.resampler.push(raw) : raw;
    const level = rms(samples);
    const floor = this.floor.update(level);
    this.events.onLevel(level, floor);

    // Inferenz der Reihe nach; fällt das Gerät zurück, Blöcke verwerfen statt aufzustauen.
    if (this.backlog >= MAX_BACKLOG) return;
    this.backlog++;
    this.busy = this.busy
      .then(async () => {
        const pipeline = this.pipeline;
        if (!pipeline) return;
        const scores = await pipeline.push(samples);
        const now = performance.now();
        if (
          this.armed &&
          now - this.armedAt >= ARM_DELAY_MS &&
          now - this.lastWake >= COOLDOWN_MS &&
          scores.some((s) => s >= THRESHOLD)
        ) {
          this.lastWake = now;
          this.events.onWake();
        }
      })
      .catch((e: unknown) => console.error("Weckwort-Erkennung", e))
      .finally(() => this.backlog--);
  }
}
