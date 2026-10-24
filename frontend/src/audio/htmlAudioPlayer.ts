import type { ClipPlayer } from "./playbackQueue";

// Short silence - used to unlock audio playback on the first user gesture (Android autoplay policy).
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** Single reused <audio> element so a one-time unlock stays valid. */
export class HtmlAudioPlayer implements ClipPlayer {
  private el = new Audio();
  private finish: ((err?: Error) => void) | null = null;
  private url: string | null = null;
  private unlocked = false;

  unlock(): void {
    if (this.unlocked || this.finish) return;
    this.unlocked = true;
    this.el.src = SILENCE;
    this.el
      .play()
      .then(() => this.el.pause())
      .catch(() => {
        this.unlocked = false;
      });
  }

  play(clip: Blob): Promise<void> {
    this.release();
    return new Promise<void>((resolve, reject) => {
      this.url = URL.createObjectURL(clip);
      this.finish = (err) => {
        this.finish = null;
        this.el.onended = null;
        this.el.onerror = null;
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = null;
        if (err) reject(err);
        else resolve();
      };
      this.el.onended = () => this.finish?.();
      this.el.onerror = () => this.finish?.(new Error("Wiedergabe fehlgeschlagen."));
      this.el.src = this.url;
      this.el.play().catch((e: unknown) => this.finish?.(e instanceof Error ? e : new Error(String(e))));
    });
  }

  stop(): void {
    this.release();
  }

  private release(): void {
    this.el.pause();
    this.finish?.();
  }
}
