# Multi-Provider-Fork (Muapi + fal.ai + apifree.ai) — Todo

Plan: `/Users/henrik/.claude/plans/fizzy-churning-lollipop.md`
Branch: `fix/multi-provider-adapters`

## P0 — Fork + Tracking ✅
- [x] Fork nach brainbytes-dev/Open-Generative-AI
- [x] Clone mit Submodulen
- [x] Bug gefixt: Open-AI-Design-Agent Submodule-Pin unreachable → repinnt auf main HEAD
- [x] Remotes: origin=fork, upstream=anil-matcha
- [x] Baseline `npm run setup && npm run build` grün

## P1 — Adapter-Skelett ✅
- [x] Exploration via Agent: muapi.js/models.js Import-Map für alle 12 Studios
- [x] `providers/registry.js`
- [x] `client.js` Dispatcher-Fassade (gleiche Exports wie muapi.js, muapi.js selbst unangetastet)
- [x] Import-Redirects in allen 13 Komponenten + index.js (muapi.js → client.js)
- [x] Settings-UI: Provider-Pills + Key-Storage pro Provider (localStorage), Gate akzeptiert jeden Provider
- [x] `key={activeProviderId}` Remount-Pattern für ImageStudio/VideoStudio (Katalog-Switch)
- [x] Muapi-only Studios (Workflows/Agents/DesignAgent/Apps) bekommen explizit `muapiApiKey`, nie den aktiven Provider-Key

## P2 — fal.ai-Adapter ✅ (verifiziert, blockiert nur an fal-Balance)
- [x] `providers/fal.js` (submit/poll gegen queue.fal.run, verifiziert via context7 Queue-API-Doku)
- [x] `providers/catalog.fal.js` kuratierter Katalog (Flux 1.1 Pro, Flux Pro Kontext, Kling 2.1 Master/Standard/Pro — Schemas aus fal-Doku verifiziert, nicht geraten)
- [x] `app/api/fal/[[...path]]/route.js` Server-Proxy (x-fal-key → Authorization: Key)
- [x] uploadFile via @fal-ai/client SDK (fal dokumentiert den raw REST-Endpoint bewusst nicht als stabil)
- [x] Browser-Test: Provider-Tabs, Gate, Settings, Image+Video-Katalog-Switch — alles fehlerfrei
- [x] Echter POST an queue.fal.run bestätigt (403 "Exhausted balance" — Pipeline korrekt, User-Guthaben leer)
- [x] Bug gefunden+gefixt: VideoStudio ModelDropdown war Modul-Level-Funktion, referenzierte alte Top-Level-Imports → jetzt Props
- [ ] Echte Bildgenerierung sehen (wartet auf fal.ai-Balance-Topup)

## P3 — apifree.ai-Adapter — ZURÜCKGESTELLT (Henrik-Entscheidung 2026-07-02)
Registry/Architektur bleibt so gebaut, dass apifree (oder jeder weitere Provider) später ein
reiner Daten-Eintrag ist (providers/apifree.js + models.apifree.js + Proxy-Route nach demselben
Muster wie fal). Kein Code dafür in diesem Durchgang.

## P4 — Studio-Sweep (alle 12)
- [ ] Image Studio
- [ ] Video Studio
- [ ] LipSync Studio
- [ ] Audio Studio
- [ ] Clipping Studio
- [ ] VibeMotion Studio
- [ ] Cinema Studio
- [ ] Marketing Studio
- [ ] Recast Studio
- [ ] Workflow Studio (Muapi-gated, dokumentieren)
- [ ] Agent Studio (Muapi-gated, dokumentieren)
- [ ] Design Agent / Apps / MCP-CLI Studio (Muapi-gated, dokumentieren)

## P5 — Deploy auf Coolify
- [ ] App in Coolify anlegen (Dockerfile Build-Pack, Port 3000)
- [ ] Deploy-Key für privates/öffentliches Fork-Repo
- [ ] Nice-Domain open-generative-ai.local.brainbyt.es (Coolify-UI)
- [ ] NPM Proxy-Host
- [ ] curl-Verifikation + Browser-Test (fal-Key, Generate)

## Nicht im Scope (v1)
- Next.js 16 Upgrade (bewusst verschoben, separater Task — middleware.js→proxy.js Konflikt mit Proxy-Design)
- Local Model Inference (Desktop-only)
- Push-to-Deploy Webhooks (LAN-Coolify)
