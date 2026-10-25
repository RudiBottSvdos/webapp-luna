export class MicDeniedError extends Error {}
export class MicUnavailableError extends Error {}

export interface Recording {
  blob: Blob;
  durationMs: number;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

/** Records with MediaRecorder; the mic stream is requested once and reused. */
export class Recorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  get recording(): boolean {
    return this.rec?.state === "recording";
  }

  private async ensureStream(): Promise<MediaStream> {
    if (this.stream && this.stream.getTracks().every((t) => t.readyState === "live")) return this.stream;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new MicUnavailableError("Aufnahme wird von diesem Browser nicht unterstützt (HTTPS nötig).");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new MicDeniedError("Mikrofonzugriff verweigert. Bitte in den Browsereinstellungen erlauben.");
      }
      throw new MicUnavailableError("Kein Mikrofon gefunden.");
    }
    return this.stream;
  }

  /** Mikrofon-Stream (einmal angefordert; die Weckwort-Erkennung hört auf demselben mit). */
  acquireStream(): Promise<MediaStream> {
    return this.ensureStream();
  }

  async start(): Promise<void> {
    if (this.recording) return;
    const stream = await this.ensureStream();
    const mimeType = pickMimeType();
    this.chunks = [];
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec = rec;
    this.startedAt = performance.now();
    rec.start();
  }

  /** Stops and returns the recording (null when nothing was recording). */
  stop(): Promise<Recording | null> {
    const rec = this.rec;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    this.rec = null;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const durationMs = performance.now() - this.startedAt;
        const blob = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
        this.chunks = [];
        resolve({ blob, durationMs });
      };
      rec.stop();
    });
  }
}
