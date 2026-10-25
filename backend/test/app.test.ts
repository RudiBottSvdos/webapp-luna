import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { DeviceStore } from '../src/devices.js';

let dir: string;
let app: FastifyInstance;
let fetchMock: ReturnType<typeof vi.fn>;

const env = (dataDir: string) => ({
  HERMES_URL: 'http://hermes:8642/',
  HERMES_API_KEY: 'secret-key',
  SPEACHES_URL: 'http://speaches:8000',
  PAIRING_PIN: '1234',
  COOKIE_SECRET: 'x'.repeat(32),
  DATA_DIR: dataDir,
});

async function setup() {
  const config = loadConfig(env(dir));
  const store = new DeviceStore(dir);
  await store.load();
  app = await buildApp(config, { store, fetch: fetchMock as unknown as typeof fetch });
  return { config, store };
}

async function pair(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/pair', payload: { pin: '1234' } });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === 'luna_device')!;
  return `luna_device=${c.value}`;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'luna-'));
  fetchMock = vi.fn();
});
afterEach(async () => {
  await app?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('Konfiguration', () => {
  it('liefert Defaults', () => {
    const c = loadConfig(env('./data'));
    expect(c.hermesModel).toBe('hermes-agent');
    expect(c.sttLanguage).toBe('de');
    expect(c.ttsFormat).toBe('mp3');
    expect(c.port).toBe(3000);
    expect(c.hermesUrl).toBe('http://hermes:8642');
  });
  it('wirft bei fehlender Pflichtvariable', () => {
    expect(() => loadConfig({})).toThrow(/Ungültige Konfiguration/);
  });
});

describe('Kopplung', () => {
  it('health ist offen', async () => {
    await setup();
    const res = await app.inject({ url: '/api/health' });
    expect(res.json()).toEqual({ ok: true });
  });

  it('lehnt geschützte Routen ohne Cookie ab', async () => {
    await setup();
    for (const [method, url] of [
      ['GET', '/api/session'],
      ['POST', '/api/chat'],
      ['POST', '/api/tts'],
      ['POST', '/api/transcribe'],
    ] as const) {
      const res = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
      expect(res.statusCode, url).toBe(401);
      expect(res.json()).toEqual({ error: 'unpaired' });
    }
  });

  it('falsche PIN -> 401 invalid_pin', async () => {
    await setup();
    const res = await app.inject({ method: 'POST', url: '/api/pair', payload: { pin: '0000' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_pin' });
  });

  it('richtige PIN setzt signiertes Cookie; Session ok; Token überlebt Neustart', async () => {
    await setup();
    const res = await app.inject({ method: 'POST', url: '/api/pair', payload: { pin: '1234' } });
    expect(res.json()).toEqual({ ok: true });
    const c = res.cookies.find((x) => x.name === 'luna_device')!;
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 31536000 });
    const cookie = `luna_device=${c.value}`;

    const s = await app.inject({ url: '/api/session', headers: { cookie } });
    expect(s.json()).toEqual({ paired: true, name: 'F.R.I.D.A.Y.' });

    // Neustart mit gleichem DATA_DIR
    await app.close();
    await setup();
    const s2 = await app.inject({ url: '/api/session', headers: { cookie } });
    expect(s2.statusCode).toBe(200);

    // Datei enthält keine Klartext-Tokens
    expect(await readFile(join(dir, 'devices.json'), 'utf8')).not.toContain(decodeURIComponent(c.value).split('.')[0]!);
  });

  it('abgelaufene/gefälschte Cookies werden abgelehnt', async () => {
    await setup();
    const res = await app.inject({ url: '/api/session', headers: { cookie: 'luna_device=abc.def' } });
    expect(res.statusCode).toBe(401);
  });

  it('limitiert Kopplungsversuche (5 pro 15 min)', async () => {
    await setup();
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/pair', payload: { pin: 'nope' } });
      expect(r.statusCode).toBe(401);
    }
    const r = await app.inject({ method: 'POST', url: '/api/pair', payload: { pin: '1234' } });
    expect(r.statusCode).toBe(429);
  });
});

describe('Chat', () => {
  const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  it('übersetzt den Hermes-Stream in delta/sentence/done', async () => {
    await setup();
    const cookie = await pair();
    const body =
      sse('response.created', { response: { id: 'r1' } }) +
      sse('response.output_text.delta', { delta: '## Hallo **Welt**. Das ist z. B. ' }) +
      sse('response.output_text.delta', { delta: 'gut.\n```\ncode\n```\nEnde' }) +
      sse('response.completed', { response: { id: 'r1' } });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { cookie },
      payload: { text: 'Hi', previousResponseId: 'prev' },
    });
    expect(res.headers['content-type']).toContain('text/event-stream');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://hermes:8642/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    expect(JSON.parse(init.body)).toEqual({ model: 'hermes-agent', input: 'Hi', stream: true, previous_response_id: 'prev' });

    const out = res.body;
    expect(out).toContain('event: delta\ndata: {"text":"## Hallo **Welt**. Das ist z. B. "}');
    expect(out).toContain('event: sentence\ndata: {"index":0,"text":"Hallo Welt."}');
    expect(out).toContain('event: sentence\ndata: {"index":1,"text":"Das ist z. B. gut."}');
    expect(out).toContain('event: sentence\ndata: {"index":2,"text":"Ende"}');
    expect(out).not.toContain('code"');
    expect(out).toContain('event: done\ndata: {"responseId":"r1"}');
  });

  it('meldet Hermes-Fehler als error-Event', async () => {
    await setup();
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(
      new Response(sse('response.failed', { response: { error: { message: 'kaputt' } } }), { status: 200 }),
    );
    const res = await app.inject({ method: 'POST', url: '/api/chat', headers: { cookie }, payload: { text: 'Hi' } });
    expect(res.body).toContain('event: error\ndata: {"message":"kaputt"}');
    expect(res.body).not.toContain('event: done');
  });

  it('meldet HTTP-Fehler von Hermes ohne Schlüssel preiszugeben', async () => {
    await setup();
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    const res = await app.inject({ method: 'POST', url: '/api/chat', headers: { cookie }, payload: { text: 'Hi' } });
    expect(res.body).toContain('event: error');
    expect(res.body).not.toContain('secret-key');
  });

  it('validiert den Body', async () => {
    await setup();
    const cookie = await pair();
    const res = await app.inject({ method: 'POST', url: '/api/chat', headers: { cookie }, payload: { text: '' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('TTS und Transkription', () => {
  it('leitet TTS an speaches weiter', async () => {
    await setup();
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'Hallo' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect([...res.rawPayload]).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://speaches:8000/v1/audio/speech');
    expect(JSON.parse(init.body)).toEqual({
      model: 'speaches-ai/piper-de_DE-thorsten-medium',
      voice: 'thorsten',
      input: 'Hallo',
      response_format: 'mp3',
    });
  });

  it('leitet TTS an Pocket TTS weiter, wenn TTS_ENGINE=pocket', async () => {
    const config = loadConfig({ ...env(dir), TTS_ENGINE: 'pocket', POCKET_TTS_URL: 'http://pocket-tts:8000/' });
    const store = new DeviceStore(dir);
    await store.load();
    app = await buildApp(config, { store, fetch: fetchMock as unknown as typeof fetch });
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), { status: 200 }));
    const res = await app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'Hallo' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/wav');
    expect([...res.rawPayload]).toEqual([4, 5, 6]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pocket-tts:8000/tts');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('text')).toBe('Hallo');
  });

  it('schickt Pocket-TTS-Anfragen nacheinander in Eingangsreihenfolge', async () => {
    const config = loadConfig({ ...env(dir), TTS_ENGINE: 'pocket' });
    const store = new DeviceStore(dir);
    await store.load();
    app = await buildApp(config, { store, fetch: fetchMock as unknown as typeof fetch });
    const cookie = await pair();
    let releaseFirst!: () => void;
    fetchMock
      .mockImplementationOnce(
        () => new Promise<Response>((r) => (releaseFirst = () => r(new Response(new Uint8Array([1]), { status: 200 })))),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([2]), { status: 200 }));
    const first = app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'Eins' } });
    const second = app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'Zwei' } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1); // zweiter Satz wartet auf den ersten
    releaseFirst();
    const [r1, r2] = await Promise.all([first, second]);
    expect([...r1.rawPayload]).toEqual([1]);
    expect([...r2.rawPayload]).toEqual([2]);
    expect((fetchMock.mock.calls[1]![1].body as FormData).get('text')).toBe('Zwei');
  });

  it('schreibt Zahlen vor der Sprachausgabe aus', async () => {
    await setup();
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));
    await app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'Es sind 18 °C um 7:30 Uhr.' } });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).input).toBe('Es sind achtzehn Grad um sieben Uhr dreißig.');
  });

  it('streamt ElevenLabs-PCM mit WAV-Header, wenn TTS_ENGINE=elevenlabs', async () => {
    const config = loadConfig({ ...env(dir), TTS_ENGINE: 'elevenlabs', ELEVENLABS_API_KEY: 'el-key', ELEVENLABS_VOICE_ID: 'voice1' });
    const store = new DeviceStore(dir);
    await store.load();
    app = await buildApp(config, { store, fetch: fetchMock as unknown as typeof fetch });
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([7, 8, 9, 10]), { status: 200 }));
    const res = await app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'Es ist 7 Uhr.' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/wav');
    const body = res.rawPayload;
    expect(body.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(body.readUInt32LE(24)).toBe(24000);
    expect([...body.subarray(44)]).toEqual([7, 8, 9, 10]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice1/stream?output_format=pcm_24000');
    expect(init.headers['xi-api-key']).toBe('el-key');
    expect(JSON.parse(init.body)).toEqual({ text: 'Es ist sieben Uhr.', model_id: 'eleven_flash_v2_5', language_code: 'de' });
  });

  it('verlangt Schlüssel und Stimme für ElevenLabs', () => {
    expect(() => loadConfig({ ...env(dir), TTS_ENGINE: 'elevenlabs' })).toThrow(/ELEVENLABS_API_KEY/);
  });

  it('begrenzt TTS-Text auf 1000 Zeichen', async () => {
    await setup();
    const cookie = await pair();
    const res = await app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'a'.repeat(1001) } });
    expect(res.statusCode).toBe(400);
  });

  it('leitet Audio an speaches STT weiter', async () => {
    await setup();
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ text: ' Guten Morgen ' }), { status: 200 }));
    const boundary = '----luna';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="a.webm"\r\nContent-Type: audio/webm;codecs=opus\r\n\r\n`,
      ),
      Buffer.from([1, 2, 3, 4]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(res.json()).toEqual({ text: 'Guten Morgen' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://speaches:8000/v1/audio/transcriptions');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('Systran/faster-whisper-small');
    expect(form.get('language')).toBe('de');
    expect((form.get('file') as File).size).toBe(4);
  });

  it('antwortet 502 wenn speaches ausfällt', async () => {
    await setup();
    const cookie = await pair();
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const res = await app.inject({ method: 'POST', url: '/api/tts', headers: { cookie }, payload: { text: 'Hallo' } });
    expect(res.statusCode).toBe(502);
  });
});
