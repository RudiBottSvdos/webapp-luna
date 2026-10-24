import { describe, expect, it } from 'vitest';
import { parseHermesEvents, parseSse, type HermesEvent } from '../src/hermes/sse.js';

const enc = new TextEncoder();

async function* chunks(text: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = enc.encode(text);
  for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size);
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const STREAM =
  ': keepalive\n\n' +
  ev('response.created', { type: 'response.created', response: { id: 'resp_1' } }) +
  ev('response.in_progress', { type: 'response.in_progress' }) +
  ev('response.output_item.added', { type: 'response.output_item.added' }) +
  ev('response.output_text.delta', { type: 'response.output_text.delta', delta: 'Hallo ' }) +
  ev('response.output_text.delta', { type: 'response.output_text.delta', delta: 'Wörter 😀.' }) +
  ev('response.completed', { type: 'response.completed', response: { id: 'resp_1' } }) +
  'data: [DONE]\n\n';

const EXPECTED: HermesEvent[] = [
  { type: 'created', responseId: 'resp_1' },
  { type: 'delta', text: 'Hallo ' },
  { type: 'delta', text: 'Wörter 😀.' },
  { type: 'completed', responseId: 'resp_1' },
];

describe('parseHermesEvents', () => {
  it.each([1, 3, 7, 1000])('parst den Stream (Chunk-Größe %i)', async (size) => {
    expect(await collect(parseHermesEvents(chunks(STREAM, size)))).toEqual(EXPECTED);
  });

  it('nutzt data.type, wenn kein event-Feld vorhanden ist', async () => {
    const s = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'x' })}\n\n`;
    expect(await collect(parseHermesEvents(chunks(s, 5)))).toEqual([{ type: 'delta', text: 'x' }]);
  });

  it('meldet response.failed', async () => {
    const s = ev('response.failed', { type: 'response.failed', response: { error: { message: 'kaputt' } } });
    expect(await collect(parseHermesEvents(chunks(s, 4)))).toEqual([{ type: 'failed', message: 'kaputt' }]);
  });

  it('meldet error-Events (verschiedene Formen)', async () => {
    expect(await collect(parseHermesEvents(chunks(ev('error', { message: 'a' }), 9)))).toEqual([
      { type: 'failed', message: 'a' },
    ]);
    expect(await collect(parseHermesEvents(chunks(ev('error', { error: { message: 'b' } }), 9)))).toEqual([
      { type: 'failed', message: 'b' },
    ]);
  });

  it('ignoriert kaputtes JSON und leere Deltas', async () => {
    const s = 'event: response.output_text.delta\ndata: {nope\n\n' + ev('response.output_text.delta', { delta: '' });
    expect(await collect(parseHermesEvents(chunks(s, 6)))).toEqual([]);
  });
});

describe('parseSse', () => {
  it('unterstützt CRLF und mehrzeilige data-Felder', async () => {
    const s = 'event: x\r\ndata: a\r\ndata: b\r\n\r\ndata: c\r\n\r\n';
    expect(await collect(parseSse(chunks(s, 2)))).toEqual([
      { event: 'x', data: 'a\nb' },
      { event: undefined, data: 'c' },
    ]);
  });
  it('liefert die letzte Nachricht auch ohne Leerzeile am Ende', async () => {
    expect(await collect(parseSse(chunks('data: z\n', 3)))).toEqual([{ event: undefined, data: 'z' }]);
  });
});
