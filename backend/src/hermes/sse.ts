export interface SseMessage {
  event?: string;
  data: string;
}

/** Generischer SSE-Parser (Kommentare, \r\n, mehrzeilige data-Felder). */
export async function* parseSse(body: AsyncIterable<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  let buf = '';
  let event: string | undefined;
  let data: string[] = [];

  const dispatch = (): SseMessage | undefined => {
    if (data.length === 0) {
      event = undefined;
      return undefined;
    }
    const msg: SseMessage = { event, data: data.join('\n') };
    event = undefined;
    data = [];
    return msg;
  };

  const handleLine = (line: string): SseMessage | undefined => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return undefined;
    const c = line.indexOf(':');
    const field = c === -1 ? line : line.slice(0, c);
    let value = c === -1 ? '' : line.slice(c + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    return undefined;
  };

  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let m: RegExpExecArray | null;
    while ((m = /\r\n|\n|\r/.exec(buf))) {
      // ein einzelnes \r am Puffer-Ende könnte Teil von \r\n sein
      if (m[0] === '\r' && m.index + 1 === buf.length) break;
      const line = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      const msg = handleLine(line);
      if (msg) yield msg;
    }
  }
  buf += decoder.decode();
  if (buf) {
    const msg = handleLine(buf);
    if (msg) yield msg;
  }
  const last = dispatch();
  if (last) yield last;
}

export type HermesEvent =
  | { type: 'created'; responseId?: string }
  | { type: 'delta'; text: string }
  | { type: 'completed'; responseId?: string }
  | { type: 'failed'; message: string };

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function errorMessage(j: any): string {
  return (
    str(j?.response?.error?.message) ??
    str(j?.error?.message) ??
    str(j?.message) ??
    str(j?.error) ??
    'Hermes hat einen Fehler gemeldet'
  );
}

/** Übersetzt OpenAI-Responses-API-Events; alle anderen Events werden ignoriert. */
export async function* parseHermesEvents(body: AsyncIterable<Uint8Array>): AsyncGenerator<HermesEvent> {
  for await (const msg of parseSse(body)) {
    if (msg.data.trim() === '[DONE]') continue;
    let j: any;
    try {
      j = JSON.parse(msg.data);
    } catch {
      continue;
    }
    const type: string | undefined = msg.event ?? str(j?.type);
    switch (type) {
      case 'response.created':
        yield { type: 'created', responseId: str(j?.response?.id) };
        break;
      case 'response.output_text.delta': {
        const d = j?.delta;
        if (typeof d === 'string' && d) yield { type: 'delta', text: d };
        break;
      }
      case 'response.completed':
        yield { type: 'completed', responseId: str(j?.response?.id) };
        break;
      case 'response.failed':
      case 'error':
        yield { type: 'failed', message: errorMessage(j) };
        break;
      default:
        break;
    }
  }
}
