import type { WakeState } from "../hooks/useLuna";

interface Props {
  wakeOn: boolean;
  wakeState: WakeState;
  onToggleWake: () => void;
  speakerOn: boolean;
  onToggleSpeaker: () => void;
  onNewConversation: () => void;
}

const WAKE_LABEL: Record<WakeState, string> = {
  off: "„Friday“ aus",
  loading: "„Friday“ startet …",
  listening: "„Friday“ an",
  "needs-tap": "„Friday“ an",
  error: "„Friday“ gestört",
};

export function Header({ wakeOn, wakeState, onToggleWake, speakerOn, onToggleSpeaker, onNewConversation }: Props) {
  return (
    <header className="header">
      <h1>
        <svg viewBox="0 0 24 24" className="logo" aria-hidden="true">
          <circle cx="12" cy="12" r="10.2" fill="none" className="logo-ring" strokeWidth="1.8" strokeDasharray="3.1 0.9" />
          <path d="M9.19 7.41h5.81v1.59h-4.13v2.16h3.38v1.5h-3.38v3.94H9.19z" />
        </svg>
        F.R.I.D.A.Y.
      </h1>
      <div className="header-actions">
        <button type="button" className={`chip ${wakeOn ? "chip-on" : ""}`} aria-pressed={wakeOn} onClick={onToggleWake}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" className="stroke" />
          </svg>
          {wakeOn ? WAKE_LABEL[wakeState] : WAKE_LABEL.off}
        </button>
        <button
          type="button"
          className={`chip ${speakerOn ? "chip-on" : ""}`}
          aria-pressed={speakerOn}
          onClick={onToggleSpeaker}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 9v6h4l5 5V4L7 9H3z" />
            {speakerOn ? (
              <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" className="stroke" />
            ) : (
              <path d="M16 9l5 6M21 9l-5 6" className="stroke" />
            )}
          </svg>
          {speakerOn ? "Vorlesen an" : "Vorlesen aus"}
        </button>
        <button type="button" className="chip" onClick={onNewConversation}>
          Neues Gespräch
        </button>
      </div>
    </header>
  );
}
