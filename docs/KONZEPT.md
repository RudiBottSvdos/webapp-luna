# Hermes-Webapp – Konzept

Oct 24, 2026 · @Niklas

## Ziel und Funktionsumfang

Ein fest montiertes Tablet am Schreibtisch wird zur Sprach- und Touch-Oberfläche für Hermes: Knopf drücken, sprechen, Antwort lesen und hören. Mikrofon, Lautsprecher und Display bringt das Tablet mit, auf dem Server läuft nur eine Web-App.

**Name: Luna.** Die KI heißt Luna. Name und Sprechweise bekommt sie in Hermes über die Datei `~/.hermes/SOUL.md`, die als Identität ganz oben im Systemprompt steht. Damit heißt sie überall Luna: auf dem Tablet, in Telegram und im Terminal. Die Webapp zeigt den Namen im Kopfbereich, ein späteres Wake Word lautet „Hey Luna“.

| Funktion | MVP | Später |
| --- | --- | --- |
| Name „Luna“ im Kopfbereich | ja |  |
| Sprechknopf (gedrückt halten oder antippen) | ja |  |
| Erkannter Text wird angezeigt | ja |  |
| Antwort als Text, live mitlaufend | ja |  |
| Antwort wird vorgelesen, bei Sprach- und Texteingabe | ja |  |
| Lautsprecher-Schalter: Vorlesen an/aus, Einstellung bleibt gespeichert | ja |  |
| Laufende Ausgabe per Tipp auf den Sprechknopf stoppen | ja |  |
| Texteingabe als Alternative | ja |  |
| „Neues Gespräch“-Knopf | ja |  |
| Anzeige, welche Werkzeuge Luna gerade nutzt |  | ja |
| Status-Leiste: KI online, GPU, Hermes erreichbar |  | ja |
| Home-Assistant-Kacheln (Licht, Szenen) |  | ja |
| Status von Claude-Code-Aufträgen |  | ja |
| Wake Word „Hey Luna“ statt Knopf |  | optional |

Die Web-App ist bewusst schlank: Sie spricht nur mit Hermes, Spracherkennung und Sprachausgabe. Logik und Gedächtnis bleiben in Hermes.

## Architektur

Das Backend in der neuen VM web ist der einzige Punkt, mit dem das Tablet spricht; es holt Spracherkennung und Sprachausgabe von speaches und die Antworten von Hermes.

&#91;embedded content: Architektur der Webapp · neue VM web, bestehende VMs hermes und ai\]

Das Tablet kennt weder Hermes noch dessen Schlüssel. Die bestehenden VMs hermes und ai ändern sich nur insofern, als Hermes seinen API-Server einschaltet.

## Ablauf einer Sprachanfrage

Eine Anfrage läuft in sechs Schritten durch; die Antwort wird satzweise vorgelesen, sobald der erste Satz fertig ist.

1. **Aufnahme:** Du hältst den Sprechknopf; der Browser nimmt per MediaRecorder als Opus/WebM auf.
2. **Upload:** Beim Loslassen geht die Aufnahme per HTTPS an das Backend.
3. **Spracherkennung:** Das Backend schickt sie an speaches (`/v1/audio/transcriptions`, Sprache Deutsch). Der erkannte Text erscheint sofort auf dem Tablet.
4. **Hermes:** Das Backend sendet den Text an den Hermes-API-Server (`/v1/responses`, Streaming, mit `previous_response_id` für den Gesprächsverlauf). Die Antwort läuft per Server-Sent Events live aufs Tablet.
5. **Sprachausgabe:** Jeder fertige Satz geht an speaches (`/v1/audio/speech`, Piper-Stimme Deutsch); die Audio-Stücke werden der Reihe nach abgespielt. Vorher entfernt das Backend Markdown-Zeichen, Links und Code, damit nichts Unsinniges vorgelesen wird. Das gilt für gesprochene und getippte Fragen; ist der Lautsprecher-Schalter aus, bleibt es beim Text. Ein Tipp auf den Sprechknopf stoppt die laufende Ausgabe sofort und startet eine neue Aufnahme.
6. **Abschluss:** Die `response_id` wird gespeichert, damit die nächste Frage im selben Gespräch weiterläuft.

**Erwartete Wartezeiten (Schätzung, im Betrieb messen):** Spracherkennung auf der CPU 1–3 s für einen kurzen Satz. Hermes bei warmem Cache einige Sekunden bis zur ersten Antwort, bei neuem Gespräch wegen \~15.000 Tokens Systemprompt bis \~1 Minute. Sprachausgabe pro Satz unter 1 s.

## Technik-Stack und Komponenten

Alles Neue läuft als Docker-Compose-Stack in einer eigenen VM web; Hermes und die KI bleiben unverändert und werden nur per API angesprochen.

| Komponente | Technik | Läuft in | Aufgabe |
| --- | --- | --- | --- |
| Frontend | TypeScript, Vite, React, als PWA | VM web (statisch ausgeliefert) | Sprechknopf, Verlauf, Audio-Wiedergabe |
| Backend | TypeScript, Node.js, Fastify | VM web | Vermittelt zwischen Tablet, speaches und Hermes; hält alle Schlüssel |
| Reverse Proxy | Caddy mit DNS-Challenge-Plugin | VM web | HTTPS-Zertifikat, Auslieferung |
| Sprache ↔ Text | [speaches](https://github.com/speaches-ai/speaches) (faster-whisper + Piper) | VM web, CPU | OpenAI-kompatible Endpunkte für Erkennung und Ausgabe |
| Assistent | Hermes-API-Server, Port 8642 | VM hermes | Verarbeitet die Anfrage mit allen Tools |
| Modell | llama-server, Port 8080 | VM ai | Bleibt unverändert |

**Hermes-Anbindung:** Hermes bringt einen eingebauten, OpenAI-kompatiblen API-Server mit ([Doku](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/open-webui)). Er wird mit `API_SERVER_ENABLED=true`, `API_SERVER_KEY`, `API_SERVER_HOST=0.0.0.0` und Standard-Port 8642 aktiviert und läuft im Hermes-Gateway. Der Responses-Endpunkt erhält den Verlauf inklusive Tool-Aufrufen über `previous_response_id`. Hinweis: Im API-Modus fehlen Hermes die Tools `clarify` und `text_to_speech`, die Sprachausgabe übernimmt daher speaches.

**Warum speaches:** Ein Dienst für beide Richtungen, OpenAI-kompatibel, mit faster-whisper für Erkennung und Piper für Ausgabe, läuft auch ohne GPU. Start mit einem kleinen bis mittleren Whisper-Modell auf der CPU; die RTX 3060 hat neben Qwen nur \~1 GB VRAM frei.

**Warum kein Open WebUI:** Es würde mit Hermes funktionieren, ist aber für Maus und Tastatur gebaut. Ein großer Sprechknopf und Vollbild-Kiosk sind mit einer eigenen schlanken App einfacher.

## Betrieb

Die Web-App läuft in einer neuen VM web und ist nur im Heimnetz unter einer HTTPS-Adresse der eigenen Domain erreichbar; ohne HTTPS gibt der Browser das Mikrofon nicht frei.

**VM web**

- Ubuntu 26.04, 2–4 Kerne, 4 GB RAM (Ballooning an), 40 GB Platte, keine GPU.
- Docker und Docker Compose; Stack aus Caddy, Backend und speaches.
- RAM-Budget danach: ai 32 + hermes 6 + dev 8 + homeassistant 4 + web 4 + Host \~4 = 58 GB von 64 GB.

**HTTPS im Heimnetz**

1. DNS-Eintrag bei deinem Domain-Anbieter: `assistent.deinedomain.de` → interne IP der VM web (A-Record auf 192.168.178.x).
2. Caddy holt das Let's-Encrypt-Zertifikat per DNS-Challenge über die API deines DNS-Anbieters. Kein Port muss geöffnet werden.
3. FritzBox: Die FritzBox blockiert öffentliche Namen, die auf interne IPs zeigen (DNS-Rebind-Schutz). Unter **Heimnetz → Netzwerk → Netzwerkeinstellungen → DNS-Rebind-Schutz** den Namen `assistent.deinedomain.de` als Ausnahme eintragen.

**Tablet**

- Kiosk-Browser (z. B. Fully Kiosk Browser auf Android): Vollbild, Autostart, Bildschirm-Steuerung, Mikrofon-Freigabe dauerhaft.
- Als PWA zum Startbildschirm hinzufügen, falls kein Kiosk-Browser genutzt wird.
- Akku schonen: Ladelimit (z. B. 80 %) oder smarte Steckdose über Home Assistant.

## Sicherheit

Hermes kann über die Web-App Befehle ausführen lassen, deshalb ist die App nur intern erreichbar und jeder Zugriff braucht ein Geräte-Token.

- **Nur intern:** keine Portfreigabe; von unterwegs nur über WireGuard.
- **Geräte-Token:** Das Tablet wird einmalig per PIN gekoppelt und erhält ein langlebiges Token (Cookie). Ohne Token keine API-Aufrufe.
- **Schlüssel nur im Backend:** `API_SERVER_KEY` von Hermes und später der Home-Assistant-Token liegen nur in der `.env` der VM web, nie im Browser.
- **Hermes-API absichern:** Port 8642 in der VM hermes per Firewall (ufw) nur für die IP der VM web öffnen.
- **Audio nicht speichern:** Aufnahmen nach der Erkennung löschen; nur der Text bleibt im Verlauf.
- **Gefährliche Aktionen:** Hermes fragt bei riskanten Befehlen nach Freigabe. Im API-Modus gibt es kein `clarify`, daher sollte das API-Profil von Hermes eingeschränkte Tools bekommen oder Freigaben über Telegram laufen.

## Umsetzungsphasen und offene Fragen

Zuerst wird die Infrastruktur vorbereitet (siehe Prompt-Dokument), danach baut Claude Code in der VM dev das MVP. Die App ist damit das erste echte Projekt für die Entwicklungs-Pipeline.

**Phase 0 – Vorbereitung**

- [ ] VM homeassistant (HAOS) anlegen
- [ ] VM dev und VM web anlegen
- [ ] Hermes-API-Server aktivieren, Firewall für Port 8642, Luna-Persönlichkeit in \~/.hermes/SOUL.md anlegen
- [ ] speaches in der VM web starten, deutsches Whisper-Modell und Piper-Stimme laden, testen
- [ ] DNS-Eintrag, Caddy-Zertifikat, FritzBox-Rebind-Ausnahme

**Phase 1 – MVP**

- [ ] Sprechknopf, Aufnahme, Upload
- [ ] Erkennung → Hermes → Textantwort live
- [ ] Satzweise Sprachausgabe (auch bei Texteingabe), Lautsprecher-Schalter, Stoppen per Tipp
- [ ] Texteingabe und „Neues Gespräch“
- [ ] Geräte-Kopplung per PIN

**Phase 2 – Komfort**

- [ ] Werkzeug-Fortschritt von Hermes anzeigen
- [ ] Status-Leiste (KI, GPU, Hermes)
- [ ] Gesprächsliste

**Phase 3 – Erweiterungen**

- [ ] Home-Assistant-Kacheln über die HA-REST-API
- [ ] Status von Claude-Code-Aufträgen
- [ ] Optional: Wake Word „Hey Luna“ (eigenes openWakeWord-Modell im Browser)

**Offene Fragen**

- Welches Tablet (Modell, Android-Version, Browser)?
- Welche Domain und welcher DNS-Anbieter? Davon hängt das Caddy-Plugin für die DNS-Challenge ab.
- Welche deutsche Piper-Stimme gefällt dir? Vor dem MVP kurz Proben anhören.
- Reicht Whisper auf der CPU, oder soll Spracherkennung später auf die GPU (dann `--n-cpu-moe` erhöhen, um VRAM frei zu machen)?

Sources: [Hermes Open WebUI / API-Server](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/open-webui), [Hermes Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/), [speaches](https://github.com/speaches-ai/speaches)
