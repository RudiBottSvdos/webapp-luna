import { z } from 'zod';

const schema = z.object({
  HERMES_URL: z.string().url(),
  HERMES_API_KEY: z.string().min(1),
  HERMES_MODEL: z.string().min(1).default('hermes-agent'),
  SPEACHES_URL: z.string().url().default('http://speaches:8000'),
  STT_MODEL: z.string().min(1).default('Systran/faster-whisper-small'),
  STT_LANGUAGE: z.string().min(2).default('de'),
  TTS_MODEL: z.string().min(1).default('speaches-ai/piper-de_DE-thorsten-medium'),
  // Piper-Modelle in speaches haben i. d. R. genau eine Stimme; "thorsten" ist der Sprecher.
  TTS_VOICE: z.string().min(1).default('thorsten'),
  TTS_FORMAT: z.enum(['mp3', 'wav', 'opus', 'flac', 'aac', 'pcm']).default('mp3'),
  // Sprachausgabe: 'speaches' (Piper über speaches) oder 'pocket' (Kyutai Pocket TTS, liefert WAV).
  TTS_ENGINE: z.enum(['speaches', 'pocket']).default('speaches'),
  POCKET_TTS_URL: z.string().url().default('http://pocket-tts:8000'),
  PAIRING_PIN: z.string().min(4),
  COOKIE_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().min(1).default('./data'),
});

export type Config = {
  hermesUrl: string;
  hermesApiKey: string;
  hermesModel: string;
  speachesUrl: string;
  sttModel: string;
  sttLanguage: string;
  ttsModel: string;
  ttsVoice: string;
  ttsFormat: 'mp3' | 'wav' | 'opus' | 'flac' | 'aac' | 'pcm';
  ttsEngine: 'speaches' | 'pocket';
  pocketTtsUrl: string;
  pairingPin: string;
  cookieSecret: string;
  port: number;
  dataDir: string;
};

const strip = (u: string) => u.replace(/\/+$/, '');

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Leere Strings (z. B. "VAR=" in .env) wie "nicht gesetzt" behandeln, damit Defaults greifen.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const r = schema.safeParse(cleaned);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Ungültige Konfiguration: ${msg}`);
  }
  const e = r.data;
  return {
    hermesUrl: strip(e.HERMES_URL),
    hermesApiKey: e.HERMES_API_KEY,
    hermesModel: e.HERMES_MODEL,
    speachesUrl: strip(e.SPEACHES_URL),
    sttModel: e.STT_MODEL,
    sttLanguage: e.STT_LANGUAGE,
    ttsModel: e.TTS_MODEL,
    ttsVoice: e.TTS_VOICE,
    ttsFormat: e.TTS_FORMAT,
    ttsEngine: e.TTS_ENGINE,
    pocketTtsUrl: strip(e.POCKET_TTS_URL),
    pairingPin: e.PAIRING_PIN,
    cookieSecret: e.COOKIE_SECRET,
    port: e.PORT,
    dataDir: e.DATA_DIR,
  };
}
