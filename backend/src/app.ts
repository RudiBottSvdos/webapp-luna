import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type { Config } from './config.js';
import type { DeviceStore } from './devices.js';
import { parseHermesEvents } from './hermes/sse.js';
import { chunkForSpeech } from './speech/chunks.js';
import { cleanForSpeech } from './speech/clean.js';
import { speakNumbers } from './speech/numbers.js';
import { SentenceSplitter } from './speech/sentences.js';

export interface AppDeps {
  store: DeviceStore;
  fetch?: typeof fetch;
  logger?: boolean;
  heartbeatMs?: number;
}

const COOKIE = 'luna_device';
const ONE_YEAR_S = 60 * 60 * 24 * 365;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const pairBody = z.object({ pin: z.string().max(128) });
const chatBody = z.object({
  text: z.string().trim().min(1).max(8000),
  previousResponseId: z.string().min(1).max(256).optional(),
});
const ttsBody = z.object({ text: z.string().trim().min(1).max(1000) });

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  pcm: 'audio/L16',
};

// Maximale Länge des ersten Sprech-Stücks einer Antwort (Zeichen).
const FIRST_CHUNK = 45;

const sha = (t: string) => createHash('sha256').update(t).digest();
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b));
}

export async function buildApp(config: Config, deps: AppDeps): Promise<FastifyInstance> {
  const doFetch = deps.fetch ?? fetch;
  const heartbeatMs = deps.heartbeatMs ?? 15_000;

  // Pocket TTS rechnet parallele Anfragen gleichzeitig auf denselben CPU-Kernen; dann ist
  // der erste Satz erst fertig, wenn fast alle fertig sind. Deshalb strikt nacheinander
  // in Eingangsreihenfolge, damit der erste Satz so früh wie möglich vorgelesen wird.
  let pocketChain: Promise<unknown> = Promise.resolve();
  const inPocketOrder = <T>(job: () => Promise<T>): Promise<T> => {
    const run = pocketChain.then(job, job);
    pocketChain = run.catch(() => undefined);
    return run;
  };
  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: true, // hinter Caddy: echte Client-IP fürs Rate-Limit
    bodyLimit: 1024 * 1024,
    connectionTimeout: 0,
    requestTimeout: 0,
  });

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(multipart, { limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 5 } });
  await app.register(rateLimit, { global: false });

  const isPaired = (req: FastifyRequest): boolean => {
    const raw = req.cookies[COOKIE];
    if (!raw) return false;
    const u = req.unsignCookie(raw);
    return u.valid && !!u.value && deps.store.has(u.value);
  };

  const requireDevice = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isPaired(req)) return reply.code(401).send({ error: 'unpaired' });
  };

  // --- öffentlich ---
  app.get('/api/health', async () => ({ ok: true }));

  app.post(
    '/api/pair',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          errorResponseBuilder: () => ({ statusCode: 429, error: 'rate_limited' }),
        },
      },
    },
    async (req, reply) => {
      const body = pairBody.safeParse(req.body);
      if (!body.success || !safeEqual(body.data.pin, config.pairingPin)) {
        return reply.code(401).send({ error: 'invalid_pin' });
      }
      const token = randomBytes(32).toString('base64url');
      await deps.store.add(token);
      reply.setCookie(COOKIE, token, {
        signed: true,
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: ONE_YEAR_S,
      });
      return { ok: true };
    },
  );

  app.get('/api/session', async (req, reply) => {
    if (!isPaired(req)) return reply.code(401).send({ error: 'unpaired' });
    return { paired: true, name: 'Luna' };
  });

  // --- geschützt ---
  app.post('/api/transcribe', { preHandler: requireDevice }, async (req, reply) => {
    if (!req.isMultipart()) return reply.code(400).send({ error: 'invalid_request' });
    let buf: Buffer;
    let mimetype: string;
    try {
      const file = await req.file();
      if (!file || file.fieldname !== 'audio') return reply.code(400).send({ error: 'invalid_request' });
      mimetype = file.mimetype;
      buf = await file.toBuffer(); // nur im Speicher, nie auf Platte
    } catch (e: any) {
      if (e?.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'too_large' });
      return reply.code(400).send({ error: 'invalid_request' });
    }
    if (buf.length === 0) return reply.code(400).send({ error: 'empty_audio' });

    const form = new FormData();
    form.append('model', config.sttModel);
    form.append('language', config.sttLanguage);
    form.append('response_format', 'json');
    const ext = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('mp4') ? 'm4a' : 'webm';
    form.append('file', new Blob([new Uint8Array(buf)], { type: mimetype }), `audio.${ext}`);

    try {
      const res = await doFetch(`${config.speachesUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        req.log.error({ status: res.status }, 'speaches STT fehlgeschlagen');
        return reply.code(502).send({ error: 'stt_failed' });
      }
      const j = (await res.json()) as { text?: unknown };
      return { text: typeof j.text === 'string' ? j.text.trim() : '' };
    } catch (e) {
      req.log.error({ err: e }, 'speaches STT nicht erreichbar');
      return reply.code(502).send({ error: 'stt_failed' });
    }
  });

  app.post('/api/chat', { preHandler: requireDevice }, async (req, reply) => {
    const body = chatBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const { text, previousResponseId } = body.data;

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    raw.flushHeaders();

    const ac = new AbortController();
    raw.on('close', () => {
      if (!raw.writableEnded) ac.abort();
    });
    const writable = () => !raw.writableEnded && !raw.destroyed;
    const send = (event: string, data: unknown) => {
      if (writable()) raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const hb = setInterval(() => {
      if (writable()) raw.write(': ping\n\n');
    }, heartbeatMs);

    try {
      const res = await doFetch(`${config.hermesUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.hermesApiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: config.hermesModel,
          input: text,
          stream: true,
          ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        req.log.error({ status: res.status }, 'Hermes-Anfrage fehlgeschlagen');
        send('error', { message: `Hermes nicht erreichbar (HTTP ${res.status})` });
        return;
      }

      const splitter = new SentenceSplitter();
      let index = 0;
      let responseId: string | undefined;
      let completed = false;
      const emit = (parts: string[]) => {
        for (const p of parts) {
          // Lange Sätze in kürzere Sprech-Stücke teilen; das allererste besonders kurz,
          // damit die Stimme möglichst bald nach dem ersten Text einsetzt.
          const clean = cleanForSpeech(p);
          const chunks = index === 0 ? chunkForSpeech(clean, FIRST_CHUNK) : chunkForSpeech(clean);
          for (const chunk of chunks) send('sentence', { index: index++, text: chunk });
        }
      };

      for await (const ev of parseHermesEvents(res.body as unknown as AsyncIterable<Uint8Array>)) {
        if (ev.type === 'created') responseId = ev.responseId ?? responseId;
        else if (ev.type === 'delta') {
          send('delta', { text: ev.text });
          emit(splitter.push(ev.text));
        } else if (ev.type === 'completed') {
          responseId = ev.responseId ?? responseId;
          completed = true;
        } else if (ev.type === 'failed') {
          send('error', { message: ev.message });
          return;
        }
      }
      emit(splitter.flush());
      if (completed) send('done', { responseId: responseId ?? null });
      else send('error', { message: 'Antwort von Hermes unvollständig' });
    } catch (e) {
      if (!ac.signal.aborted) {
        req.log.error({ err: e }, 'Chat-Stream fehlgeschlagen');
        send('error', { message: 'Verbindung zu Hermes unterbrochen' });
      }
    } finally {
      clearInterval(hb);
      if (!raw.writableEnded) raw.end();
    }
  });

  app.post('/api/tts', { preHandler: requireDevice }, async (req, reply) => {
    const body = ttsBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });

    const ac = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) ac.abort();
    });
    const text = speakNumbers(body.data.text); // Pocket TTS spricht keine Ziffern
    try {
      if (config.ttsEngine === 'pocket') {
        // Pocket TTS streamt WAV schneller als Echtzeit; durchreichen, damit das Frontend
        // schon während der Erzeugung abspielt. Stimme und Sprache stehen im Pocket-Dienst.
        // Die Reihenfolge-Sperre bleibt gehalten, bis dieses Stück fertig übertragen ist.
        let release!: () => void;
        const transferred = new Promise<void>((r) => (release = r));
        const res = await new Promise<Response | null>((resolve, reject) => {
          void inPocketOrder(async () => {
            if (ac.signal.aborted) return resolve(null); // Wiedergabe abgebrochen, während das Stück wartete
            const form = new FormData();
            form.append('text', text);
            try {
              resolve(await doFetch(`${config.pocketTtsUrl}/tts`, { method: 'POST', body: form, signal: ac.signal }));
            } catch (e) {
              return reject(e);
            }
            await transferred;
          });
        });
        if (!res) return reply;
        if (!res.ok || !res.body) {
          release();
          req.log.error({ status: res.status, engine: 'pocket' }, 'TTS fehlgeschlagen');
          return reply.code(502).send({ error: 'tts_failed' });
        }
        const audio = Readable.fromWeb(res.body as any);
        audio.once('close', release);
        reply.raw.once('close', release);
        return reply.header('Cache-Control', 'no-store').type('audio/wav').send(audio);
      }

      const res = await doFetch(`${config.speachesUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ttsModel,
          voice: config.ttsVoice,
          input: text,
          response_format: config.ttsFormat,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        req.log.error({ status: res.status, engine: 'speaches' }, 'TTS fehlgeschlagen');
        return reply.code(502).send({ error: 'tts_failed' });
      }
      const type = AUDIO_TYPES[config.ttsFormat] ?? res.headers.get('content-type') ?? 'application/octet-stream';
      return reply
        .header('Cache-Control', 'no-store')
        .type(type)
        .send(Readable.fromWeb(res.body as any));
    } catch (e) {
      if (ac.signal.aborted) return reply;
      req.log.error({ err: e, engine: config.ttsEngine }, 'TTS nicht erreichbar');
      return reply.code(502).send({ error: 'tts_failed' });
    }
  });

  return app;
}
