import { Conversation } from "./components/Conversation";
import { Header } from "./components/Header";
import { PairScreen } from "./components/PairScreen";
import { TalkButton } from "./components/TalkButton";
import { TextComposer } from "./components/TextComposer";
import { useLuna } from "./hooks/useLuna";

export function App() {
  const luna = useLuna();

  if (luna.session === "loading") return <main className="center">F.R.I.D.A.Y. startet …</main>;
  if (luna.session === "offline") {
    return (
      <main className="center">
        <p>Das Backend ist nicht erreichbar.</p>
        <button type="button" className="chip" onClick={() => void luna.retrySession()}>
          Erneut versuchen
        </button>
      </main>
    );
  }
  if (luna.session === "unpaired") return <PairScreen onPair={luna.pair} />;

  return (
    <div className="app">
      <Header
        wakeOn={luna.wakeOn}
        wakeState={luna.wakeState}
        onToggleWake={() => luna.setWakeOn(!luna.wakeOn)}
        speakerOn={luna.speakerOn}
        onToggleSpeaker={() => luna.setSpeakerOn(!luna.speakerOn)}
        onNewConversation={luna.newConversation}
      />
      <Conversation messages={luna.messages} />
      {luna.error && (
        <div className="error" role="alert">
          <span>{luna.error}</span>
          <button type="button" onClick={luna.dismissError} aria-label="Meldung schließen">
            ✕
          </button>
        </div>
      )}
      <div className="composer-area">
        <TextComposer onSend={luna.submitText} />
      </div>
      <div className="dock">
        <TalkButton status={luna.status} wake={luna.wakeOn ? luna.wakeState : "off"} onDown={luna.pressDown} onUp={luna.pressUp} />
      </div>
    </div>
  );
}
