import { useState } from "react";
import { NetworkError, RateLimitedError } from "../api/client";

const MAX_LEN = 12;

export function PairScreen({ onPair }: { onPair: (pin: string) => Promise<boolean> }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await onPair(value);
      if (!ok) {
        setError("Falsche PIN. Bitte noch einmal versuchen.");
        setPin("");
      }
    } catch (e) {
      if (e instanceof RateLimitedError) setError("Zu viele Versuche. Bitte kurz warten.");
      else if (e instanceof NetworkError) setError("Das Backend ist nicht erreichbar.");
      else setError("Kopplung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => setPin((p) => (p.length < MAX_LEN ? p + d : p));
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <main className="pair">
      <h1>F.R.I.D.A.Y.</h1>
      <p className="pair-hint">Dieses Gerät koppeln: bitte PIN eingeben.</p>
      <div className="pin-display" aria-label={`PIN, ${pin.length} Ziffern eingegeben`}>
        {pin ? "•".repeat(pin.length) : " "}
      </div>
      <p className="pair-error" role="alert">
        {error}
      </p>
      <div className="pad">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} disabled={busy}>
            {k}
          </button>
        ))}
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} aria-label="Löschen">
          ⌫
        </button>
        <button type="button" onClick={() => press("0")} disabled={busy}>
          0
        </button>
        <button type="button" className="ok" onClick={() => void submit(pin)} disabled={busy || !pin} aria-label="Koppeln">
          ✓
        </button>
      </div>
    </main>
  );
}
