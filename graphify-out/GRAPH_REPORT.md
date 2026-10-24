# Graph Report - .  (2026-10-24)

## Corpus Check
- Corpus is ~12,443 words - fits in a single context window. You may not need a graph.

## Summary
- 299 nodes · 426 edges · 16 communities
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Konzept & Deployment-Stack
- Frontend App & Audio-Recorder
- Backend App & Routen
- Backend package.json Dev
- Frontend tsconfig
- Audio-Wiedergabe
- Backend tsconfig
- API-Client
- Frontend package.json
- Frontend Dev-Dependencies
- Hermes SSE Parser
- Satzsplitter
- Backend Dependencies
- Frontend SSE Parser
- tsconfig.build

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 14 edges
2. `compilerOptions` - 14 edges
3. `Backend (Fastify)` - 13 edges
4. `buildApp()` - 11 edges
5. `DeviceStore` - 11 edges
6. `PlaybackQueue` - 9 edges
7. `SseParser` - 8 edges
8. `parseHermesEvents()` - 7 edges
9. `SentenceSplitter` - 7 edges
10. `HtmlAudioPlayer` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Backend (Fastify)` --references--> `buildApp()`  [INFERRED]
  README.md → backend/src/app.ts
- `Geraete-Kopplung per PIN` --implements--> `DeviceStore`  [INFERRED]
  README.md → backend/src/devices.ts
- `Bereinigung fuer Sprachausgabe` --implements--> `cleanForSpeech()`  [INFERRED]
  docs/KONZEPT.md → backend/src/speech/clean.ts
- `Satzweise Sprachausgabe` --implements--> `SentenceSplitter`  [INFERRED]
  docs/KONZEPT.md → backend/src/speech/sentences.ts
- `Frontend (Vite React PWA)` --references--> `App()`  [INFERRED]
  README.md → frontend/src/App.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Voice-Pipeline: Tablet, Backend, speaches, Hermes** — luna_frontend, luna_backend, speaches, hermes [EXTRACTED 1.00]
- **Docker-Compose-Stack Services** — compose_caddy, compose_backend, compose_speaches [EXTRACTED 1.00]
- **Sicherheitskonzept** — wireguard_access, secrets_backend_only, audio_not_stored, firewall_8642, device_pairing [EXTRACTED 1.00]

## Communities (16 total, 0 thin omitted)

### Community 0 - "Konzept & Deployment-Stack"
Cohesion: 0.07
Nodes (35): API-Routen unter /api, Audio nicht speichern, Caddy Reverse Proxy, Service backend, Service caddy, Service speaches, Geraete-Kopplung per PIN, Docker-Compose-Stack (+27 more)

### Community 1 - "Frontend App & Audio-Recorder"
Cohesion: 0.08
Nodes (24): App(), MicDeniedError, MicUnavailableError, MIME_CANDIDATES, pickMimeType(), Recorder, Recording, Conversation() (+16 more)

### Community 2 - "Backend App & Routen"
Cohesion: 0.12
Nodes (19): AppDeps, AUDIO_TYPES, buildApp(), chatBody, pairBody, safeEqual(), sha(), ttsBody (+11 more)

### Community 3 - "Backend package.json Dev"
Cohesion: 0.09
Nodes (21): devDependencies, tsx, @types/node, typescript, vitest, engines, node, typescript (+13 more)

### Community 4 - "Frontend tsconfig"
Cohesion: 0.09
Nodes (21): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+13 more)

### Community 5 - "Audio-Wiedergabe"
Cohesion: 0.16
Nodes (6): HtmlAudioPlayer, ClipPlayer, PlaybackQueue, PlaybackQueueOptions, deferred(), setup()

### Community 6 - "Backend tsconfig"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noUncheckedIndexedAccess, outDir (+11 more)

### Community 7 - "API-Client"
Cohesion: 0.21
Nodes (13): ApiError, chat(), ChatEvent, check(), getSession(), NetworkError, pair(), RateLimitedError (+5 more)

### Community 8 - "Frontend package.json"
Cohesion: 0.12
Nodes (15): dependencies, react, react-dom, name, private, scripts, build, dev (+7 more)

### Community 9 - "Frontend Dev-Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, @types/react, @types/react-dom, typescript, vite, vite-plugin-pwa, @vitejs/plugin-react, vitest (+7 more)

### Community 10 - "Hermes SSE Parser"
Cohesion: 0.20
Nodes (8): errorMessage(), HermesEvent, parseHermesEvents(), parseSse(), SseMessage, enc, EXPECTED, SSE-Streaming (delta/sentence/done)

### Community 11 - "Satzsplitter"
Cohesion: 0.32
Nodes (8): ABBREV, findBoundary(), isAbbrev(), MONTHS, nextWord(), SentenceSplitter, SOFT_ABBREV, splitSentences()

### Community 12 - "Backend Dependencies"
Cohesion: 0.18
Nodes (11): dependencies, fastify, @fastify/cookie, @fastify/multipart, @fastify/rate-limit, zod, fastify, @fastify/cookie (+3 more)

### Community 13 - "Frontend SSE Parser"
Cohesion: 0.36
Nodes (3): readSse(), SseEvent, SseParser

### Community 14 - "tsconfig.build"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ./tsconfig.json

## Knowledge Gaps
- **96 isolated node(s):** `name`, `version`, `private`, `type`, `node` (+91 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Backend (Fastify)` connect `Konzept & Deployment-Stack` to `Backend App & Routen`, `Hermes SSE Parser`?**
  _High betweenness centrality (0.161) - this node is a cross-community bridge._
- **Why does `Frontend (Vite React PWA)` connect `Konzept & Deployment-Stack` to `Frontend App & Audio-Recorder`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `App()` connect `Frontend App & Audio-Recorder` to `Konzept & Deployment-Stack`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _96 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Konzept & Deployment-Stack` be split into smaller, more focused modules?**
  _Cohesion score 0.06543385490753911 - nodes in this community are weakly interconnected._
- **Should `Frontend App & Audio-Recorder` be split into smaller, more focused modules?**
  _Cohesion score 0.08392603129445235 - nodes in this community are weakly interconnected._
- **Should `Backend App & Routen` be split into smaller, more focused modules?**
  _Cohesion score 0.12298387096774194 - nodes in this community are weakly interconnected._