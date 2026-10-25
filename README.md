# F.R.I.D.A.Y. – Sprach-Webapp für Hermes

F.R.I.D.A.Y. ist eine schlanke Web-App für ein fest montiertes Kiosk-Tablet: Knopf drücken, sprechen, Antwort lesen und hören. Die App spricht ausschließlich mit [Hermes](https://hermes-agent.nousresearch.com/) (Nous Research); Logik und Gedächtnis bleiben in Hermes. Das vollständige Konzept steht in [docs/KONZEPT.md](docs/KONZEPT.md).

## Architektur

```
Tablet (PWA) ──HTTPS──> Caddy ──/api/*──> Backend (Fastify) ──> Hermes   (VM hermes, :8642)
                          │                     └──────────────> speaches (STT + TTS, im Stack)
                          └── statisches Frontend (/srv)
```

- **Frontend** (`frontend/`): Vite + React, PWA. Kennt weder Hermes noch Schlüssel.
- **Backend** (`backend/`): Node.js 22, Fastify. Hält alle Schlüssel, koppelt Geräte per PIN, vermittelt zu speaches und Hermes, zerlegt die Antwort in sprechfertige Sätze (Markdown, Code, Links, Emoji entfernt).
- **speaches**: faster-whisper (Spracherkennung) und Piper (Sprachausgabe), OpenAI-kompatibel, CPU.
- **Caddy**: HTTPS per DNS-Challenge, liefert das Frontend aus und leitet `/api/*` ans Backend (mit SSE-Flush).

### API (alle Routen unter `/api`)

| Route | Beschreibung |
| --- | --- |
| `GET /health` | Lebenszeichen, ohne Anmeldung |
| `POST /pair` | `{pin}` → setzt Cookie `luna_device` (signiert, httpOnly, Secure, SameSite=Strict, 1 Jahr). Max. 5 Versuche / 15 min / IP |
| `GET /session` | `{paired:true,name:"F.R.I.D.A.Y."}` oder 401 `{error:"unpaired"}` |
| `POST /transcribe` | multipart, Feld `audio` (webm/opus, max. 10 MB) → `{text}` |
| `POST /chat` | `{text, previousResponseId?}` → SSE: `delta`, `sentence`, `done`, `error` |
| `POST /tts` | `{text}` (max. 1000 Zeichen) → Audio |

Alle Routen außer `health` und `pair` verlangen ein gültiges Geräte-Cookie, sonst 401 `{error:"unpaired"}`.

## Lokale Entwicklung

Voraussetzung: Node.js 22.

```bash
# Backend
cd backend
cp ../.env.example .env        # Werte setzen (HERMES_URL, HERMES_API_KEY, PAIRING_PIN, COOKIE_SECRET, SPEACHES_URL=...)
npm install
npm run dev                    # http://localhost:3000
npm test                       # Unit-Tests (Satzsplitter, Bereinigung, SSE-Parser, API)
```

`.env` wird vom Backend nicht automatisch geladen; Variablen vorher exportieren oder z. B. `node --env-file=.env` bzw. `npx tsx watch --env-file=.env src/server.ts` verwenden.

```bash
# Frontend (Vite-Proxy leitet /api an das Backend auf :3000)
cd frontend
npm install
npm run dev
```

Hinweis: Das Cookie ist `Secure`. Browser akzeptieren das auf `http://localhost`; für andere Hosts ist HTTPS nötig.

## Deployment (VM web)

```bash
cp .env.example .env           # ausfüllen (PIN, COOKIE_SECRET, HERMES_*, LUNA_DOMAIN, DNS-Token)
docker compose up -d --build
```

Der Stack besteht aus `caddy` (80/443), `backend` und `speaches` (nur intern erreichbar). Caddy wird mit dem DNS-Plugin aus `CADDY_DNS_PLUGIN` gebaut (Standard: Cloudflare). Für einen anderen Anbieter `CADDY_DNS_PLUGIN` und `CADDY_DNS_PROVIDER` in `.env` anpassen (ggf. Optionen im `Caddyfile`, siehe Kommentar dort).

### Sprachausgabe mit Pocket TTS

Mit `TTS_ENGINE=pocket` in `.env` übernimmt der Dienst `pocket-tts` ([Kyutai Pocket TTS](https://huggingface.co/kyutai/pocket-tts), CPU) die Sprachausgabe statt Piper. Der Dienst gehört zum Compose-Profil `pocket` und startet nur damit: `docker compose --profile pocket up -d`. Sprache und Stimme stehen in `POCKET_TTS_LANGUAGE` und `POCKET_TTS_VOICE`. Das Modell wird beim ersten Start heruntergeladen (Volume `pocket_hf`) und braucht etwa 1,7 GB RAM. Ausgabe ist WAV.

### Sprachausgabe mit ElevenLabs

Mit `TTS_ENGINE=elevenlabs` geht die Sprachausgabe an ElevenLabs (Cloud). Nötig sind `ELEVENLABS_API_KEY` und `ELEVENLABS_VOICE_ID`; Modell per `ELEVENLABS_MODEL` (Standard `eleven_flash_v2_5`). Das Backend fordert 16-Bit-PCM mit 24 kHz an und streamt es mit WAV-Header an das Frontend. Achtung: Die vorgelesenen Antworttexte verlassen dabei das Heimnetz. Danach `docker compose up -d backend`.

### speaches: Modelle laden

speaches lädt Modelle nicht von selbst. Einmalig nach dem ersten Start (Container-intern, da der Port nicht veröffentlicht ist):

```bash
docker compose exec speaches curl -X POST http://localhost:8000/v1/models/Systran/faster-whisper-small
docker compose exec speaches curl -X POST http://localhost:8000/v1/models/speaches-ai/piper-de_DE-thorsten-medium
docker compose exec speaches curl http://localhost:8000/v1/models   # Kontrolle
```

Die Modell-IDs müssen zu `STT_MODEL` und `TTS_MODEL` in `.env` passen. Die Modelle liegen im Volume `hf_cache` und bleiben erhalten. Bei Abweichungen gilt die [speaches-Dokumentation](https://github.com/speaches-ai/speaches).

### Hermes einrichten (VM hermes)

API-Server aktivieren (z. B. in `~/.hermes/.env`) und das Gateway neu starten:

```
API_SERVER_ENABLED=true
API_SERVER_KEY=<langer zufälliger Schlüssel>   # = HERMES_API_KEY in der .env der Webapp
API_SERVER_HOST=0.0.0.0
# Port: Standard 8642
```

Port 8642 per Firewall nur für die IP der VM web öffnen (`ufw allow from <IP-VM-web> to any port 8642`). Name und Sprechweise „F.R.I.D.A.Y.“ stehen in `~/.hermes/SOUL.md`. Hinweis: Im API-Modus fehlen Hermes `clarify` und `text_to_speech`; die Sprachausgabe übernimmt speaches.

### Geräte koppeln

Beim ersten Aufruf der App fragt F.R.I.D.A.Y. nach der PIN (`PAIRING_PIN`). Nach korrekter Eingabe erhält das Tablet ein langlebiges Cookie (1 Jahr); die gekoppelten Geräte (nur Hashes) liegen im Volume unter `DATA_DIR/devices.json`. Zum Entziehen aller Geräte: die Datei löschen und Backend neu starten; zum Ändern der Cookie-Signatur `COOKIE_SECRET` ersetzen.

### FritzBox: DNS-Rebind-Schutz

Zeigt `assistent.deinedomain.de` auf eine interne IP, blockiert die FritzBox die Auflösung. Unter **Heimnetz → Netzwerk → Netzwerkeinstellungen → DNS-Rebind-Schutz** den Namen als Ausnahme eintragen. Ohne HTTPS gibt der Browser das Mikrofon nicht frei.

## Sicherheit in Kürze

- Nur im Heimnetz erreichbar, keine Portfreigabe; von unterwegs nur per WireGuard.
- Schlüssel (`HERMES_API_KEY`) nur im Backend; `.env` ist per `.gitignore` ausgeschlossen.
- Audio wird nur im Speicher verarbeitet und nie gespeichert.
