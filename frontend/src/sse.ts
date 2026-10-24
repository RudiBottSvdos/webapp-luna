export interface SseEvent {
  event: string;
  data: string;
}

/** Incremental Server-Sent-Events parser (handles chunk splits, CRLF, comments, multi-line data). */
export class SseParser {
  private buffer = "";
  private event = "";
  private data: string[] = [];

  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let idx: number;
    // Process complete lines only (a lone trailing \r may still become \r\n).
    while ((idx = this.nextLineEnd()) !== -1) {
      const line = this.buffer.slice(0, idx);
      const skip = this.buffer.startsWith("\r\n", idx) ? 2 : 1;
      this.buffer = this.buffer.slice(idx + skip);
      const ev = this.processLine(line);
      if (ev) out.push(ev);
    }
    return out;
  }

  /** Flush a trailing event when the stream ends without a blank line. */
  end(): SseEvent[] {
    const out: SseEvent[] = [];
    if (this.buffer) {
      const ev = this.processLine(this.buffer.replace(/\r$/, ""));
      this.buffer = "";
      if (ev) out.push(ev);
    }
    const last = this.dispatch();
    if (last) out.push(last);
    return out;
  }

  private nextLineEnd(): number {
    const m = /\r\n|\n|\r(?!$)/.exec(this.buffer);
    return m ? m.index : -1;
  }

  private processLine(line: string): SseEvent | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    else if (field === "data") this.data.push(value);
    return null;
  }

  private dispatch(): SseEvent | null {
    if (this.data.length === 0) {
      this.event = "";
      return null;
    }
    const ev = { event: this.event || "message", data: this.data.join("\n") };
    this.event = "";
    this.data = [];
    return ev;
  }
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const ev of parser.feed(decoder.decode(value, { stream: true }))) yield ev;
    }
    for (const ev of parser.feed(decoder.decode())) yield ev;
    for (const ev of parser.end()) yield ev;
  } finally {
    reader.releaseLock();
  }
}
