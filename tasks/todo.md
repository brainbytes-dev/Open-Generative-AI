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
- [x] `providers/catalog.fal.js` kuratierter Basis-Katalog (Flux 1.1 Pro, Nano Banana, Seedream 4.0, Ideogram V3,
      Flux Pro Kontext, Gemini 3 Pro Image Edit, Kling 2.1 Master, Hailuo 02 Pro, Kling 2.1 Standard/Pro, Veo 3.1 Fast)
- [x] `app/api/fal/[[...path]]/route.js` Server-Proxy (x-fal-key → Authorization: Key), erweitert um `/v1/*` → api.fal.ai (Platform API)
- [x] uploadFile via @fal-ai/client SDK (fal dokumentiert den raw REST-Endpoint bewusst nicht als stabil)
- [x] Browser-Test: Provider-Tabs, Gate, Settings, Image+Video-Katalog-Switch — alles fehlerfrei
- [x] Echter POST an queue.fal.run bestätigt (403 "Exhausted balance" — Pipeline korrekt, User-Guthaben leer)
- [x] Bug gefunden+gefixt: VideoStudio ModelDropdown war Modul-Level-Funktion, referenzierte alte Top-Level-Imports → jetzt Props
- [ ] Echte Bildgenerierung sehen (wartet auf fal.ai-Balance-Topup)

## P2b — Voller fal.ai-Katalog via Live-Discovery ✅ (Henrik-Wunsch 2026-07-02: "alle Modelle die da sind")
- [x] `providers/fal-discovery.js`: fal Platform API (`/v1/models?category=X`, verifiziert live per curl mit echtem Key)
      listet + paginiert alle aktiven Modelle pro Kategorie; `?endpoint_id=X&expand=openapi-3.0` liefert das
      echte OpenAPI-Input-Schema pro Modell (kein Raten — Schema kommt von fal selbst, zur Laufzeit abgefragt)
- [x] `buildGenericPayload()`: mappt unsere normalisierten Params (prompt/image_url/aspect_ratio/seed/duration)
      generisch auf die Feldnamen, die das jeweilige Modell-Schema tatsächlich deklariert
- [x] `catalog.fal.js` Live-Store: kuratierte Einträge + `ensureFalCatalogLoaded()` lädt alle 4 Kategorien
      (text-to-image/image-to-image/text-to-video/image-to-video) im Hintergrund nach, dedupliziert gegen
      kuratierte IDs, `subscribeFalCatalog()` löst Re-Render aus sobald geladen — kuratiert first (sofort
      nutzbar), volle Liste folgt nach
- [x] ImageStudio/VideoStudio: `useReducer`-Force-Rerender + `useEffect` triggert Laden beim Mount, Muapi-Bundle
      bleibt unberührt (Funktionen sind `undefined` dort, `?.()`-Guards)
- [x] Browser-verifiziert: Image-Dropdown zeigt 130+ Modelle (GPT Image 1/1.5/2, Grok Imagine, Nano Banana 2,
      Recraft, Ideogram, Stable Diffusion Familie, ...), Video-Dropdown zeigt Sora/Veo/Runway-Familie (131 Items)
- [x] Generischer Payload-Builder end-to-end getestet: `gpt-image-1` ausgewählt → Schema live gefetcht →
      POST an `queue.fal.run/fal-ai/gpt-image-1/text-to-image` ging korrekt raus (403 Balance, kein Bug)
- Bekannte Grenze: dynamisch geladene Modelle zeigen nur Prompt+Generate (kein Aspect-Ratio/Resolution-Picker,
  da UI dafür Studio-spezifische Buttons bräuchte) — kuratierte Modelle behalten die volle UI

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

## Später — Lokale GPU als Provider (Henrik-Idee 2026-07-02)
Henrik hat lokal eine GPU. Web-App-Local-Inference gibt's im Upstream nicht (nur Electron-Desktop,
sd.cpp/Wan2GP). Möglicher 4. Provider: eigener Wan2GP/ComfyUI-Server auf Henriks Maschine, von der
Web-App per URL angesprochen (Registry ist schon so gebaut, dass ein weiterer Provider ein Daten-
Eintrag + Adapter ist). Separater Task, nicht Teil dieses Durchgangs.

## Nicht im Scope (v1)
- Next.js 16 Upgrade (bewusst verschoben, separater Task — middleware.js→proxy.js Konflikt mit Proxy-Design)
- Local Model Inference (Desktop-only)
- Push-to-Deploy Webhooks (LAN-Coolify)
