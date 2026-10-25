import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api/client";
import { PlaybackQueue } from "../audio/playbackQueue";
import { MicDeniedError, MicUnavailableError, Recorder } from "../audio/recorder";
import { WebAudioPlayer } from "../audio/webAudioPlayer";
import { Endpointer } from "../wakeword/endpointer";
import { WakeListener } from "../wakeword/listener";

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

export type Phase = "idle" | "recording" | "transcribing" | "thinking";
export type Status = Phase | "speaking";
export type SessionState = "loading" | "paired" | "unpaired" | "offline";
export type WakeState = "off" | "loading" | "listening" | "needs-tap" | "error";

const TAP_MS = 300;
const MIN_RECORDING_MS = 400;
const MAX_RECORDING_MS = 60_000;
const SPEAKER_KEY = "luna.speaker";
const WAKE_KEY = "luna.wake";

function loadSpeaker(): boolean {
  try {
    return localStorage.getItem(SPEAKER_KEY) !== "off";
  } catch {
    return true;
  }
}

function loadWake(): boolean {
  try {
    return localStorage.getItem(WAKE_KEY) === "on";
  } catch {
    return false;
  }
}

function errorText(e: unknown): string {
  if (e instanceof api.NetworkError) return "Das Backend ist nicht erreichbar. Läuft die Verbindung?";
  if (e instanceof MicDeniedError || e instanceof MicUnavailableError || e instanceof api.ApiError) return e.message;
  return "Etwas ist schiefgelaufen. Bitte noch einmal versuchen.";
}

export function useLuna() {
  const [session, setSession] = useState<SessionState>("loading");
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakerOn, setSpeakerOnState] = useState(loadSpeaker);
  const [wakeOn, setWakeOnState] = useState(loadWake);
  const [wakeState, setWakeState] = useState<WakeState>("off");

  const speakerRef = useRef(speakerOn);
  const phaseRef = useRef<Phase>("idle");
  const responseId = useRef<string | null>(null);
  const nextId = useRef(1);
  const chatAbort = useRef<AbortController | null>(null);
  const transcribeAbort = useRef<AbortController | null>(null);
  const runToken = useRef(0);
  const recorder = useRef(new Recorder());
  const player = useRef(new WebAudioPlayer());
  const press = useRef({ active: false, at: 0, releasedAsHold: false, starting: false, startCancelled: false });
  const maxTimer = useRef<number | null>(null);
  // Weckwort: Listener, Sprechende-Erkennung der laufenden freihändigen Aufnahme, letztes Grundrauschen
  const wakeListener = useRef<WakeListener | null>(null);
  const handsFree = useRef<Endpointer | null>(null);
  const noiseFloor = useRef(0);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const handleUnauthorized = useCallback(() => setSession("unpaired"), []);

  const queue = useRef<PlaybackQueue<Response> | null>(null);
  if (!queue.current) {
    queue.current = new PlaybackQueue<Response>({
      fetchClip: (text, signal) => api.tts(text, signal),
      player: player.current,
      // Der Server erzeugt Sprache Stück für Stück; so kommt der erste Satz zuerst dran.
      sequentialFetch: true,
      onActiveChange: setSpeaking,
      onError: (e) => {
        if (e instanceof api.UnauthorizedError) handleUnauthorized();
        else setError("Die Sprachausgabe ist ausgefallen. Der Text bleibt sichtbar.");
      },
    });
  }

  // Session check
  const checkSession = useCallback(async () => {
    setSession("loading");
    try {
      setSession((await api.getSession()) ? "paired" : "unpaired");
    } catch {
      setSession("offline");
    }
  }, []);
  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Unlock audio on first user gesture (Android autoplay policy).
  useEffect(() => {
    const unlock = () => player.current.unlock();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  const clearMaxTimer = () => {
    if (maxTimer.current !== null) window.clearTimeout(maxTimer.current);
    maxTimer.current = null;
  };

  const stopOutput = useCallback(() => {
    runToken.current++;
    chatAbort.current?.abort();
    chatAbort.current = null;
    transcribeAbort.current?.abort();
    transcribeAbort.current = null;
    queue.current?.stop();
    setMessages((m) => (m.some((x) => x.streaming) ? m.map((x) => (x.streaming ? { ...x, streaming: false } : x)) : m));
  }, []);

  const runChat = useCallback(
    async (text: string) => {
      const token = ++runToken.current;
      const ctrl = new AbortController();
      chatAbort.current = ctrl;
      const assistantId = nextId.current++;
      setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "", streaming: true }]);
      setPhaseBoth("thinking");
      const stale = () => token !== runToken.current;
      const patch = (fn: (t: Message) => Message) =>
        setMessages((m) => m.map((x) => (x.id === assistantId ? fn(x) : x)));
      try {
        for await (const ev of api.chat(text, responseId.current, ctrl.signal)) {
          if (stale()) return;
          if (ev.type === "delta") patch((x) => ({ ...x, text: x.text + ev.text }));
          else if (ev.type === "sentence") {
            if (speakerRef.current) queue.current?.enqueue(ev.text);
          } else if (ev.type === "done") {
            if (ev.responseId) responseId.current = ev.responseId;
          } else if (ev.type === "error") {
            setError(`Hermes meldet einen Fehler: ${ev.message}`);
          }
        }
      } catch (e) {
        if (stale()) return;
        if (e instanceof api.UnauthorizedError) handleUnauthorized();
        else setError(errorText(e));
      }
      if (stale()) return;
      patch((x) => ({ ...x, streaming: false }));
      // Drop an empty assistant bubble (e.g. error before any text).
      setMessages((m) => m.filter((x) => !(x.id === assistantId && x.text === "")));
      chatAbort.current = null;
      setPhaseBoth("idle");
    },
    [handleUnauthorized, setPhaseBoth],
  );

  const submitText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      setError(null);
      stopOutput();
      handsFree.current = null;
      if (recorder.current.recording) void recorder.current.stop();
      clearMaxTimer();
      setMessages((m) => [...m, { id: nextId.current++, role: "user", text: t }]);
      void runChat(t);
    },
    [runChat, stopOutput],
  );

  const finishRecording = useCallback(async () => {
    handsFree.current = null;
    clearMaxTimer();
    const rec = await recorder.current.stop();
    if (!rec || rec.durationMs < MIN_RECORDING_MS || rec.blob.size === 0) {
      setPhaseBoth("idle");
      return;
    }
    const ctrl = new AbortController();
    transcribeAbort.current = ctrl;
    const token = ++runToken.current;
    setPhaseBoth("transcribing");
    try {
      const text = await api.transcribe(rec.blob, ctrl.signal);
      if (token !== runToken.current) return;
      transcribeAbort.current = null;
      if (!text) {
        setError("Ich habe nichts verstanden. Bitte noch einmal sprechen.");
        setPhaseBoth("idle");
        return;
      }
      setMessages((m) => [...m, { id: nextId.current++, role: "user", text }]);
      await runChat(text);
    } catch (e) {
      if (token !== runToken.current) return;
      transcribeAbort.current = null;
      if (e instanceof api.UnauthorizedError) handleUnauthorized();
      else setError(errorText(e));
      setPhaseBoth("idle");
    }
  }, [handleUnauthorized, runChat, setPhaseBoth]);

  const beginRecording = useCallback(async () => {
    setError(null);
    setPhaseBoth("recording");
    const p = press.current;
    p.starting = true;
    p.startCancelled = false;
    try {
      await recorder.current.start();
    } catch (e) {
      p.starting = false;
      setError(errorText(e));
      setPhaseBoth("idle");
      return;
    }
    p.starting = false;
    if (p.startCancelled) {
      void recorder.current.stop();
      setPhaseBoth("idle");
      return;
    }
    maxTimer.current = window.setTimeout(() => void finishRecording(), MAX_RECORDING_MS);
    // Button was already released as a hold while the mic permission/start was pending.
    if (p.releasedAsHold) {
      p.releasedAsHold = false;
      void finishRecording();
    }
  }, [finishRecording, setPhaseBoth]);

  const pressDown = useCallback(() => {
    player.current.unlock();
    const p = press.current;
    p.releasedAsHold = false;
    if (phaseRef.current === "recording") {
      // second tap of tap-to-toggle mode
      p.active = false;
      if (p.starting) p.startCancelled = true;
      else void finishRecording();
      return;
    }
    stopOutput(); // also aborts a running upload/stream and stops audio
    p.active = true;
    p.at = performance.now();
    void beginRecording();
  }, [beginRecording, finishRecording, stopOutput]);

  const pressUp = useCallback(() => {
    const p = press.current;
    if (!p.active) return;
    p.active = false;
    if (performance.now() - p.at >= TAP_MS) {
      if (p.starting) p.releasedAsHold = true;
      else if (phaseRef.current === "recording") void finishRecording();
    }
    // else: short tap -> keep recording until the next tap
  }, [finishRecording]);

  // --- Weckwort "Friday": Aufnahme ohne Knopf, Ende über die Sprechpause
  const startHandsFree = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    stopOutput();
    wakeListener.current?.beep();
    handsFree.current = new Endpointer(noiseFloor.current);
    void beginRecording();
  }, [beginRecording, stopOutput]);

  const onLevel = useCallback(
    (level: number, floor: number) => {
      noiseFloor.current = floor;
      const ep = handsFree.current;
      if (!ep || phaseRef.current !== "recording" || press.current.starting) return;
      const r = ep.feed(level);
      if (r === "end") void finishRecording();
      else if (r === "no-speech") {
        handsFree.current = null;
        clearMaxTimer();
        void recorder.current.stop();
        setPhaseBoth("idle");
      }
    },
    [finishRecording, setPhaseBoth],
  );

  // Der Listener lebt länger als ein Render; er ruft immer die aktuellen Callbacks.
  const wakeHandlers = useRef({ startHandsFree, onLevel });
  wakeHandlers.current = { startHandsFree, onLevel };

  useEffect(() => {
    if (!wakeOn || session !== "paired") return;
    let cancelled = false;
    const listener = new WakeListener({
      onWake: () => wakeHandlers.current.startHandsFree(),
      onLevel: (level, floor) => wakeHandlers.current.onLevel(level, floor),
    });
    setWakeState("loading");
    void (async () => {
      try {
        await listener.start(await recorder.current.acquireStream());
        if (cancelled) return listener.stop();
        wakeListener.current = listener;
        setWakeState(listener.suspended ? "needs-tap" : "listening");
      } catch (e) {
        listener.stop();
        if (cancelled) return;
        console.error("Weckwort", e);
        setWakeState("error");
        setError(
          e instanceof MicDeniedError || e instanceof MicUnavailableError
            ? e.message
            : "Die Erkennung von „Friday“ konnte nicht starten.",
        );
      }
    })();
    return () => {
      cancelled = true;
      listener.stop();
      wakeListener.current = null;
      handsFree.current = null;
      setWakeState("off");
    };
  }, [wakeOn, session]);

  // Nach einem Neuladen hält der Browser den Audio-Kontext an, bis einmal getippt wurde.
  useEffect(() => {
    if (wakeState !== "needs-tap") return;
    const wake = () =>
      void wakeListener.current
        ?.resume()
        .then(() => setWakeState(wakeListener.current?.suspended ? "needs-tap" : "listening"));
    window.addEventListener("pointerdown", wake, { capture: true });
    return () => window.removeEventListener("pointerdown", wake, { capture: true });
  }, [wakeState]);

  // Nur im Leerlauf scharf: nicht während Aufnahme, Nachdenken oder eigener Sprachausgabe.
  useEffect(() => {
    wakeListener.current?.setArmed(wakeState === "listening" && phase === "idle" && !speaking);
  }, [wakeState, phase, speaking]);

  const setWakeOn = useCallback((on: boolean) => {
    player.current.unlock();
    setWakeOnState(on);
    try {
      localStorage.setItem(WAKE_KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, []);

  const setSpeakerOn = useCallback((on: boolean) => {
    speakerRef.current = on;
    setSpeakerOnState(on);
    try {
      localStorage.setItem(SPEAKER_KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (!on) queue.current?.stop();
  }, []);

  const newConversation = useCallback(() => {
    stopOutput();
    handsFree.current = null;
    if (recorder.current.recording) void recorder.current.stop();
    clearMaxTimer();
    responseId.current = null;
    setMessages([]);
    setError(null);
    setPhaseBoth("idle");
  }, [setPhaseBoth, stopOutput]);

  const pair = useCallback(async (pin: string) => {
    const ok = await api.pair(pin); // throws RateLimitedError / NetworkError
    if (ok) setSession("paired");
    return ok;
  }, []);

  useEffect(() => {
    if (session === "unpaired") {
      stopOutput();
      setPhaseBoth("idle");
    }
  }, [session, stopOutput, setPhaseBoth]);

  const status: Status = useMemo(() => {
    if (phase === "recording" || phase === "transcribing") return phase;
    if (speaking) return "speaking";
    return phase;
  }, [phase, speaking]);

  return {
    session,
    retrySession: checkSession,
    messages,
    status,
    error,
    dismissError: () => setError(null),
    speakerOn,
    setSpeakerOn,
    wakeOn,
    setWakeOn,
    wakeState,
    pressDown,
    pressUp,
    submitText,
    newConversation,
    pair,
  };
}
