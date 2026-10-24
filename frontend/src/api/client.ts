import { readSse } from "../sse";

export class UnauthorizedError extends Error {
  constructor() {
    super("unpaired");
  }
}
export class RateLimitedError extends Error {}
export class ApiError extends Error {}
export class NetworkError extends Error {
  constructor() {
    super("Das Backend ist nicht erreichbar.");
  }
}

async function request(input: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(input, { credentials: "same-origin", ...init });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new NetworkError();
  }
}

function check(res: Response): Response {
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new ApiError(`Fehler vom Server (${res.status}).`);
  return res;
}

/** True when this device is paired. */
export async function getSession(): Promise<boolean> {
  const res = await request("/api/session");
  if (res.status === 401) return false;
  check(res);
  return true;
}

/** Resolves true when paired, false when the PIN is invalid. */
export async function pair(pin: string): Promise<boolean> {
  const res = await request("/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (res.status === 401) return false;
  if (res.status === 429) throw new RateLimitedError();
  check(res);
  return true;
}

export async function transcribe(blob: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `aufnahme.${ext}`);
  const res = check(await request("/api/transcribe", { method: "POST", body: form, signal }));
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** Startet die Sprachausgabe; der Body wird gestreamt (WAV von Pocket TTS oder mp3 von speaches). */
export async function tts(text: string, signal?: AbortSignal): Promise<Response> {
  return check(
    await request("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    }),
  );
}

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "sentence"; index: number; text: string }
  | { type: "done"; responseId: string | null }
  | { type: "error"; message: string };

export async function* chat(
  text: string,
  previousResponseId: string | null,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = check(
    await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(previousResponseId ? { text, previousResponseId } : { text }),
      signal,
    }),
  );
  if (!res.body) throw new ApiError("Leere Antwort vom Server.");
  for await (const ev of readSse(res.body)) {
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      continue;
    }
    switch (ev.event) {
      case "delta":
        yield { type: "delta", text: String(d.text ?? "") };
        break;
      case "sentence":
        yield { type: "sentence", index: Number(d.index ?? 0), text: String(d.text ?? "") };
        break;
      case "done":
        yield { type: "done", responseId: typeof d.responseId === "string" ? d.responseId : null };
        break;
      case "error":
        yield { type: "error", message: String(d.message ?? "Unbekannter Fehler") };
        break;
    }
  }
}
