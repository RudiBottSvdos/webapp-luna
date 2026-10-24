import { describe, expect, it } from "vitest";
import { PlaybackQueue, type ClipPlayer } from "./playbackQueue";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const fetches = new Map<string, ReturnType<typeof deferred<Blob>>>();
  const played: string[] = [];
  const plays: ReturnType<typeof deferred<void>>[] = [];
  const active: boolean[] = [];
  const errors: unknown[] = [];
  let stops = 0;
  const player: ClipPlayer = {
    play: async (clip) => {
      played.push(await clip.text());
      const d = deferred<void>();
      plays.push(d);
      return d.promise;
    },
    stop: () => {
      stops++;
      plays.forEach((p) => p.resolve());
    },
  };
  const q = new PlaybackQueue({
    fetchClip: (text) => {
      const d = deferred<Blob>();
      fetches.set(text, d);
      return d.promise;
    },
    player,
    onActiveChange: (a) => active.push(a),
    onError: (e) => errors.push(e),
  });
  return { q, fetches, played, plays, active, errors, stops: () => stops };
}

describe("PlaybackQueue", () => {
  it("plays in order even if later clips arrive first, and prefetches", async () => {
    const s = setup();
    s.q.enqueue("a");
    s.q.enqueue("b");
    s.q.enqueue("c");
    expect([...s.fetches.keys()]).toEqual(["a", "b", "c"]);
    s.fetches.get("c")!.resolve(new Blob(["C"]));
    s.fetches.get("b")!.resolve(new Blob(["B"]));
    await tick();
    expect(s.played).toEqual([]);
    s.fetches.get("a")!.resolve(new Blob(["A"]));
    await tick();
    expect(s.played).toEqual(["A"]);
    s.plays[0].resolve();
    await tick();
    expect(s.played).toEqual(["A", "B"]);
    s.plays[1].resolve();
    await tick();
    s.plays[2].resolve();
    await tick();
    expect(s.played).toEqual(["A", "B", "C"]);
    expect(s.active).toEqual([true, false]);
  });

  it("stop() clears pending clips and ignores late fetches", async () => {
    const s = setup();
    s.q.enqueue("a");
    s.q.enqueue("b");
    s.fetches.get("a")!.resolve(new Blob(["A"]));
    await tick();
    expect(s.played).toEqual(["A"]);
    s.q.stop();
    expect(s.stops()).toBe(1);
    s.fetches.get("b")!.resolve(new Blob(["B"]));
    await tick();
    expect(s.played).toEqual(["A"]);
    expect(s.q.active).toBe(false);
    s.q.enqueue("c");
    s.fetches.get("c")!.resolve(new Blob(["C"]));
    await tick();
    expect(s.played).toEqual(["A", "C"]);
  });

  it("skips clips whose fetch fails and reports the error", async () => {
    const s = setup();
    s.q.enqueue("a");
    s.q.enqueue("b");
    s.fetches.get("a")!.reject(new Error("tts down"));
    s.fetches.get("b")!.resolve(new Blob(["B"]));
    await tick();
    expect(s.played).toEqual(["B"]);
    expect(s.errors).toHaveLength(1);
  });

  it("ignores blank sentences", () => {
    const s = setup();
    s.q.enqueue("   ");
    expect(s.fetches.size).toBe(0);
  });
});
