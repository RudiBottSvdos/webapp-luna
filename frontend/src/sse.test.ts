import { describe, expect, it } from "vitest";
import { readSse, SseParser, type SseEvent } from "./sse";

describe("SseParser", () => {
  it("parses events and ignores comments", () => {
    const p = new SseParser();
    const evs = p.feed(
      ': ping\n\nevent: delta\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"responseId":"r1"}\n\n',
    );
    expect(evs).toEqual([
      { event: "delta", data: '{"text":"Hi"}' },
      { event: "done", data: '{"responseId":"r1"}' },
    ]);
  });

  it("handles chunks split at arbitrary positions", () => {
    const text = 'event: sentence\ndata: {"index":0,"text":"Hallo."}\n\n';
    for (let i = 1; i < text.length; i++) {
      const p = new SseParser();
      const evs = [...p.feed(text.slice(0, i)), ...p.feed(text.slice(i))];
      expect(evs).toEqual([{ event: "sentence", data: '{"index":0,"text":"Hallo."}' }]);
    }
  });

  it("handles CRLF, also split between CR and LF", () => {
    const p = new SseParser();
    const evs = [...p.feed("event: x\r"), ...p.feed("\ndata: 1\r\n\r"), ...p.feed("\n")];
    expect(evs).toEqual([{ event: "x", data: "1" }]);
  });

  it("joins multi-line data and defaults event to message", () => {
    const p = new SseParser();
    expect(p.feed("data: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb" }]);
  });

  it("flushes a trailing event on end()", () => {
    const p = new SseParser();
    expect(p.feed("event: done\ndata: {}")).toEqual([]);
    expect(p.end()).toEqual([{ event: "done", data: "{}" }]);
  });
});

describe("readSse", () => {
  it("reads a byte stream with multibyte chars split across chunks", async () => {
    const bytes = new TextEncoder().encode('event: delta\ndata: {"text":"Grüße"}\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 33));
        c.enqueue(bytes.slice(33));
        c.close();
      },
    });
    const out: SseEvent[] = [];
    for await (const e of readSse(stream)) out.push(e);
    expect(out).toEqual([{ event: "delta", data: '{"text":"Grüße"}' }]);
  });
});
