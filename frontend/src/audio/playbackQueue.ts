export interface ClipPlayer<C = Blob> {
  /** Resolves when the clip has finished (or was stopped). */
  play(clip: C): Promise<void>;
  stop(): void;
}

export interface PlaybackQueueOptions<C = Blob> {
  fetchClip: (text: string, signal: AbortSignal) => Promise<C>;
  player: ClipPlayer<C>;
  onActiveChange?: (active: boolean) => void;
  onError?: (error: unknown) => void;
  /**
   * Request the next clip only after the previous request has been answered. Keeps the
   * server-side order equal to the sentence order when the server works one clip at a time.
   */
  sequentialFetch?: boolean;
}

/**
 * Plays TTS clips strictly in enqueue order. Clips are fetched immediately on enqueue
 * (so the next one is ready while the current one plays) but never played out of order.
 */
export class PlaybackQueue<C = Blob> {
  private items: Promise<C | null>[] = [];
  private running = false;
  private generation = 0;
  private controller = new AbortController();
  private lastFetch: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: PlaybackQueueOptions<C>) {}

  get active(): boolean {
    return this.running;
  }

  enqueue(text: string): void {
    if (!text.trim()) return;
    const signal = this.controller.signal;
    const fetchClip = () => this.opts.fetchClip(text, signal);
    const started = this.opts.sequentialFetch ? this.lastFetch.then(fetchClip, fetchClip) : fetchClip();
    this.lastFetch = started.catch(() => undefined);
    const clip = started
      .then<C | null>((b) => b)
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
    this.lastFetch = Promise.resolve();
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
