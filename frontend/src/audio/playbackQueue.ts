export interface ClipPlayer {
  /** Resolves when the clip has finished (or was stopped). */
  play(clip: Blob): Promise<void>;
  stop(): void;
}

export interface PlaybackQueueOptions {
  fetchClip: (text: string, signal: AbortSignal) => Promise<Blob>;
  player: ClipPlayer;
  onActiveChange?: (active: boolean) => void;
  onError?: (error: unknown) => void;
}

/**
 * Plays TTS clips strictly in enqueue order. Clips are fetched immediately on enqueue
 * (so the next one is ready while the current one plays) but never played out of order.
 */
export class PlaybackQueue {
  private items: Promise<Blob | null>[] = [];
  private running = false;
  private generation = 0;
  private controller = new AbortController();

  constructor(private readonly opts: PlaybackQueueOptions) {}

  get active(): boolean {
    return this.running;
  }

  enqueue(text: string): void {
    if (!text.trim()) return;
    const signal = this.controller.signal;
    const clip = this.opts
      .fetchClip(text, signal)
      .then<Blob | null>((b) => b)
      .catch((e: unknown) => {
        if (!signal.aborted) this.opts.onError?.(e);
        return null;
      });
    this.items.push(clip);
    void this.run();
  }

  stop(): void {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.items = [];
    this.opts.player.stop();
    this.setRunning(false);
  }

  private setRunning(v: boolean): void {
    if (this.running === v) return;
    this.running = v;
    this.opts.onActiveChange?.(v);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    const gen = this.generation;
    this.setRunning(true);
    while (gen === this.generation && this.items.length > 0) {
      const next = this.items.shift()!;
      const blob = await next;
      if (gen !== this.generation) return;
      if (!blob) continue;
      try {
        await this.opts.player.play(blob);
      } catch (e) {
        if (gen === this.generation) this.opts.onError?.(e);
      }
    }
    if (gen === this.generation) this.setRunning(false);
  }
}
