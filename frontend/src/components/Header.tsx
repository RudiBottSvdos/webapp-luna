interface Props {
  speakerOn: boolean;
  onToggleSpeaker: () => void;
  onNewConversation: () => void;
}

export function Header({ speakerOn, onToggleSpeaker, onNewConversation }: Props) {
  return (
    <header className="header">
      <h1>
        <svg viewBox="0 0 24 24" className="logo" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
        </svg>
        F.R.I.D.A.Y.
      </h1>
      <div className="header-actions">
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
