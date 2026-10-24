import { useEffect, useRef } from "react";
import type { Message } from "../hooks/useLuna";
import { Markdown } from "../markdown";

export function Conversation({ messages }: { messages: Message[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages.length, last?.text]);

  return (
    <section className="conversation" aria-label="Gespräch" aria-live="polite">
      {messages.length === 0 && <p className="empty">Hallo, ich bin Luna. Wie kann ich helfen?</p>}
      {messages.map((m) => (
        <div key={m.id} className={`bubble bubble-${m.role}`}>
          {m.role === "assistant" ? <Markdown text={m.text} /> : <p>{m.text}</p>}
          {m.streaming && <span className="cursor" aria-hidden="true" />}
        </div>
      ))}
      <div ref={endRef} />
    </section>
  );
}
