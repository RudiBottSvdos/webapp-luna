import type { ClipPlayer } from "./playbackQueue";

// Kleiner Vorlauf beim Start, damit der erste Puffer nicht anknackst.
const START_DELAY = 0.08;

const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.length) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/**
 * Zerlegt einen (gestreamten) 16-Bit-PCM-WAV-Bytestrom in Float-Samples je Kanal.
 * Die Längenfelder im Header werden ignoriert: Pocket TTS kennt sie beim Streamen noch nicht.
 */
export class WavStreamParser {
  sampleRate = 0;
  channels = 1;
  private head: Uint8Array = new Uint8Array(0);
  private inData = false;
  private leftover: Uint8Array = new Uint8Array(0);

  /** Samples je Kanal aus diesem Stück; leer, solange der Header noch unvollständig ist. */
  push(chunk: Uint8Array): Float32Array[] {
    if (!this.inData) {
      this.head = concat(this.head, chunk);
      const start = this.dataOffset();
      if (start < 0) return [];
      this.inData = true;
      chunk = this.head.subarray(start);
      this.head = new Uint8Array(0);
    }
    const bytes = concat(this.leftover, chunk);
    const frameBytes = 2 * this.channels;
    const usable = bytes.length - (bytes.length % frameBytes);
    this.leftover = bytes.slice(usable);
    const frames = usable / frameBytes;
    if (!frames) return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
    const out = Array.from({ length: this.channels }, () => new Float32Array(frames));
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < this.channels; c++) out[c]![f] = view.getInt16((f * this.channels + c) * 2, true) / 32768;
    }
    return out;
  }

  /** Byte-Offset der PCM-Daten im gesammelten Header, -1 solange er unvollständig ist. */
  private dataOffset(): number {
    const h = this.head;
    if (h.length < 12) return -1;
    if (tag(h, 0) !== "RIFF" || tag(h, 8) !== "WAVE") throw new Error("Die Sprachausgabe liefert kein WAV.");
    const v = new DataView(h.buffer, h.byteOffset, h.length);
    let off = 12;
    while (off + 8 <= h.length) {
      const id = tag(h, off);
      const size = v.getUint32(off + 4, true);
      if (id === "data") {
        if (!this.sampleRate) throw new Error("WAV ohne Formatangabe.");
        return off + 8;
      }
      if (off + 8 + size > h.length) return -1;
      if (id === "fmt ") {
        const format = v.getUint16(off + 8, true);
        const bits = v.getUint16(off + 22, true);
        if (format !== 1 || bits !== 16) throw new Error("Nur 16-Bit-PCM-WAV wird unterstützt.");
        this.channels = v.getUint16(off + 10, true);
        this.sampleRate = v.getUint32(off + 12, true);
      }
      off += 8 + size + (size % 2);
    }
    return -1;
  }
}

/**
 * Spielt Antworten von /api/tts über die Web Audio API ab. WAV wird schon während des
 * Empfangs abgespielt (Pocket TTS streamt schneller als Echtzeit), andere Formate nach dem
 * vollständigen Laden. Eine AudioContext-Instanz für alles, damit die Freischaltung gilt.
 */
export class WebAudioPlayer implements ClipPlayer<Response> {
  private ctx: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private abort: (() => void) | null = null;

  private context(): AudioContext {
    this.ctx ??= new AudioContext();
    return this.ctx;
  }

  /** Beim ersten Tippen aufrufen (Autoplay-Regeln von Android/iOS). */
  unlock(): void {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start();
  }

  async play(res: Response): Promise<void> {
    this.stop();
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);

    let stopped = false;
    let next = 0;
    let lastEnd: Promise<void> = Promise.resolve();
    let wake: () => void = () => undefined;
    const stoppedSignal = new Promise<void>((r) => (wake = r));
    const reader = res.body?.getReader();
    this.abort = () => {
      stopped = true;
      void reader?.cancel().catch(() => undefined);
      wake();
    };

    const schedule = (buf: AudioBuffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const at = Math.max(next, ctx.currentTime + START_DELAY);
      src.start(at);
      next = at + buf.duration;
      this.sources.add(src);
      lastEnd = new Promise<void>((r) => {
        src.onended = () => {
          this.sources.delete(src);
          r();
        };
      });
    };

    try {
      if (!reader) return;
      if ((res.headers.get("content-type") ?? "").includes("wav")) {
        const parser = new WavStreamParser();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || stopped) break;
          const channels = parser.push(value);
          if (!channels.length) continue;
          const buf = ctx.createBuffer(channels.length, channels[0]!.length, parser.sampleRate);
          channels.forEach((data, i) => buf.copyToChannel(data as Float32Array<ArrayBuffer>, i));
          schedule(buf);
        }
      } else {
        const parts: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done || stopped) break;
          parts.push(value);
        }
        if (!stopped) schedule(await ctx.decodeAudioData(await new Blob(parts as BlobPart[]).arrayBuffer()));
      }
      if (!stopped) await Promise.race([lastEnd, stoppedSignal]);
    } catch (e) {
      if (!stopped) throw e instanceof Error ? e : new Error("Wiedergabe fehlgeschlagen.");
    } finally {
      if (this.abort && stopped === false) this.abort = null;
    }
  }

  stop(): void {
    this.abort?.();
    this.abort = null;
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // schon beendet
      }
    }
    this.sources.clear();
  }
}
