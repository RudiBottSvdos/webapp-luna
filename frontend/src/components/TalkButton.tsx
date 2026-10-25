import type { PointerEvent } from "react";
import type { Status, WakeState } from "../hooks/useLuna";

const LABELS: Record<Status, string> = {
  idle: "Zum Sprechen halten oder tippen",
  recording: "Ich höre zu … loslassen oder erneut tippen",
  transcribing: "Verstehe …",
  thinking: "F.R.I.D.A.Y. denkt nach …",
  speaking: "F.R.I.D.A.Y. spricht – tippen zum Unterbrechen",
};

const WAKE_IDLE: Partial<Record<WakeState, string>> = {
  listening: "Sag „Friday“ – oder Knopf halten bzw. tippen",
  "needs-tap": "Einmal tippen, dann höre ich auf „Friday“",
};

interface Props {
  status: Status;
  wake?: WakeState;
  onDown: () => void;
  onUp: () => void;
}

export function TalkButton({ status, wake = "off", onDown, onUp }: Props) {
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onDown();
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onUp();
  };
  return (
    <div className="talk">
      <button
        type="button"
        className={`talk-btn talk-${status}`}
        aria-label="Sprechen"
        aria-pressed={status === "recording"}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            onDown();
            onUp();
          }
        }}
      >
        <span className="talk-ring" aria-hidden="true" />
        <svg className="talk-icon" viewBox="0 0 24 24" aria-hidden="true">
          {status === "speaking" ? (
            <rect x="6" y="6" width="12" height="12" rx="2" />
          ) : (
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2z" />
          )}
        </svg>
      </button>
      <p className="talk-label" role="status" aria-live="polite">
        {(status === "idle" && WAKE_IDLE[wake]) || LABELS[status]}
      </p>
    </div>
  );
}
