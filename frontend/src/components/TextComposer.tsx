import { useState, type FormEvent } from "react";

export function TextComposer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <form className="composer" onSubmit={submit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Oder hier tippen …"
        aria-label="Nachricht an Luna"
        enterKeyHint="send"
        autoComplete="off"
      />
      <button type="submit" disabled={!text.trim()}>
        Senden
      </button>
    </form>
  );
}
