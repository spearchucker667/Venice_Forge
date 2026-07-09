# File Tree

> Source-of-truth repo map for Venice Forge. Generated against the v2.1.2
> tree. Third-party copyright is NOT present in this repository; only
> first-party code and docs are listed here. See
> `docs/legal/THIRD_PARTY_NOTICES.md` for upstream dependency attributions.

---

## Top level

```
.
├── AGENTS.md              # canonical AI/dev-agent workflow + validator roster
├── README.md              # canonical public-facing entry point (begin here)
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
├── package.json           # scripts, deps, engines (Node ≥22.13, npm ≥10)
├── server.ts              # Express proxy for web mode (Venice + Jina)
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json          # renderer
├── tsconfig.electron.json # Electron main + preload
├── electron-builder.config.cjs
├── tailwind.config.*
├── postcss.config.*
├── .env.example           # tracked (no real keys)
├── .config/               # local YAML configs (gitignored except *.example)
├── assets/                # icons + branding
├── build/                 # tracked: icon.{ico,icns,png}; rest is .gitignore'd
├── dist/                  # vite build output (.gitignore'd)
├── dist-electron/         # main + preload bundle output (.gitignore'd)
├── coverage/              # v8 coverage output (.gitignore'd)
├── config/                # tracked starter theme YAMLs
├── public/                # static assets served in dev
├── release/               # packaged installer output (.gitignore'd)
├── scripts/               # dev + verify + bootstrap helpers
├── docs/                  # documentation (see docs/DOCS_INDEX.md)
├── electron/              # Electron main + preload
├── src/                   # React/TS renderer
├── tests/                 # cross-cutting suites (smoke, csp, theme, storage, accessibility)
└── .github/               # workflows + issue + PR templates
```

---

## `src/` (renderer / web)

```
src/
├── main.tsx               # bootstraps React + Zustand + safetyHydration gate
├── App.tsx                # tab router, header, sidebar, command palette host
├── App.{lazy,navigation,skip-link}.test.ts
├── safetyHydration.ts     # renderer-side safety preflight hydration gate
├── index.css              # tokens, fonts, Tailwind entry
├── components/            # all visible UI (see below)
├── config/                # YAML schema + tabs registry + image-model capabilities
├── constants/             # prompt templates, Venice constants, model lists
├── data/                  # static seed data
├── hooks/                 # page/store-scoped React hooks
├── lib/                   # framework-internal pure helpers + Zustand-persist
├── research/              # research agent + providers (Venice, Jina, generic HTTP)
├── services/              # cross-cutting renderer-side services (storage, telemetry, etc.)
├── shared/                # code shared between renderer, web proxy, and Electron
├── stores/                # all Zustand slice stores
├── styles/                # additional CSS modules
├── theme/                 # YAML theme loader, contrast helpers, built-ins
├── types/                 # canonical TS types (character cards, scenes, projects, …)
└── utils/                 # small first-party helpers
```

### `src/components/`

Grouped by feature area. Test files are colocated (`*.test.tsx` next to source).

| Area | Files |
|------|-------|
| Layout | `layout/` (header, sidebar, inspector pane) |
| Chat | `chat/` (chat-view, chat-input, message-bubble, HistoryView, CharacterSceneCard) |
| Image Studio | `image/` (image-view, image-tools, payload helpers) |
| Media Studio | `gallery/` (gallery-view, media-inspector, compare-view, lineage-viewer, recipe-compatibility) |
| Audio / Music | `audio/`, `music/` |
| Video Studio | `video/` |
| Embeddings | `embeddings/` |
| Research | `research/` + `search/` + `SearchScrapeView.tsx` |
| RP Studio | `rp-studio/` (CharacterLibrary, CharacterEditor, Persona/Lorebook managers, RpChat, SceneGenerator, PromptDebugDrawer, AssetGallery) |
| Workflows | `workflows/` (ReactFlow) |
| Prompts | `prompts/` |
| Scenes | `scenes/` |
| Privacy & Storage | `privacy/` (StoragePrivacyDashboard) |
| Status & Diagnostics | `status/` |
| Settings | `settings/` + `SettingsView.tsx` |
| Playground | `playground/` |
| Command Palette | `command-palette/` |
| Shared primitives | `ui/`, `Chip.tsx`, `Field.tsx`, `CollapsibleSection.tsx`, `ConfirmModal.tsx`, `ToastHost.tsx`, `ErrorBoundary.tsx`, etc. |
| Cross-feature | `CharactersView.tsx`, `ThemeMaker.{tsx,ui.test.tsx}`, `OnboardingSplash.tsx`, `ModelSelect.tsx`, `FirstRunModal.tsx`, `MemoryManagerModal.tsx`, `ImageGenerationPreview.tsx` |

### `src/services/`

Cross-cutting renderer services + ingest + privacy + workflow + scene compilers,
plus the active-profile hub (`activeProfile.ts`), `storageService.ts`, and the
Venice client wrappers (`veniceClient.web.test.ts`, `veniceClient.desktop.test.ts`,
`veniceClient.edge.test.ts`).

| Group | Highlights |
|-------|------------|
| Venice HTTP | `veniceClient/`, `veniceClient.ts`, `veniceClient.{web,desktop,edge}.test.ts`, `desktopBridge.ts`, `cryptoService.ts`, `attachmentService.ts` |
| Storage | `storageService.ts`, `dbMigrations.ts`, `mediaMigration.ts`, `storageMaintenance.ts`, `storagePrivacyService.ts`, `characterScene*.ts`, `activeProfile.ts` |
| Telemetry | `inspectorTelemetry.ts`, `diagnosticsService.ts`, `characterImageDiagnostics.ts` |
| Compilation | `sceneCompiler.ts`, `workflowCompiler.ts`, `workflowRunner.ts`, `rpPromptCompiler.ts`, `characterCardImportExport.ts`, `exportImport.ts`, `prompt-enhancer-service.ts` |
| Memory / Models | `memoryService.ts`, `modelClassification.ts`, `modelService.ts`, `promptStarterService.ts` |
| Research | `researchService.ts`, `researchSummaries.ts`, `researchBrowserBridge.ts` |
| Media | `mediaService.ts`, `imageWorkflowService.ts` |
| RP | `rp/` (assetService, characterCardService, lorebookRenderer, promptBuilder, rpChat, sceneGenerationService, memoryPuller, …) |
| Ingestion | `ingestion/` (text / code / pdf / docx / image / veniceTextParser / attachmentAssembler / xmlEscape) |

### `src/stores/`

Zustand slice stores. Tests cololocate (`*.test.ts`) except for the long-running
locks (`chat-store.performance.test.ts`, `chat-store.multimodal.test.ts`).

auth, chat (chat-store + 6 test files for flush / dirty / character / multimodal
/ performance / web), playground, settings (settings-store + 2 test files),
toast, workflow, media (media + bulk actions + selection + send-to + export
bundle + command handlers), project, image-workspace, scenario, scene-asset,
scene-composer, rp-chat, persona, lorebook, character, character-card, prompt
library, research, workflow-template, inspector, status, storage-privacy, config,
profile.

### `src/lib/`

Pure helpers shared between renderer pages: `safe-storage.ts` (Zustand-persist
profile-namespaced wrapper), `stream.ts` (SSE parsing), `venice-client.ts`
(Electron-only thin client), `workflow-*` (workflow engine, schema,
mutations, validator), `playground-agent*`, `utils.ts`.

### `src/research/`

`agent/` (research runner, evidence store, citation builder), `providers/`
(Venice + Jina + generic HTTP scrape, all routed through the SSRF DNS guard).

### `src/shared/`

Code reused by the renderer, the web proxy, and the Electron main process:
`validation.ts` (canonical Venice endpoint allowlist), `safety/`
(`childExploitationGuard`, `localFamilySafeGuard`, `matchTables`,
`normalization`, `characterImportSafety`), `redaction.ts`, `apiConfig.ts`,
`configSchema.ts`, `veniceSafeMode.ts`, `readBoundedFetchBody.ts`,
`urlSecurity.ts`, `limits.ts`, `logger.ts`, `legal.ts`.

### `src/theme/`

YAML theme loader, contrast checkers, built-ins (`builtins/`), validator, and
appliers. See `tests/theme/inlineColorInvariant.test.ts` for the token discipline.

```
src/theme/
├── builtins/              # one file per built-in theme (35 total)
│   ├── index.ts           # registry + BUILTIN_THEMES array
│   ├── amberArchive.ts
│   ├── arcticGlass.ts
│   ├── auroraBoreal.ts
│   ├── basaltNoir.ts
│   ├── circuitMint.ts
│   ├── copper.ts
│   ├── catppuccin.ts
│   ├── cyberOrchid.ts
│   ├── dark.ts
│   ├── desertCopperfield.ts
│   ├── dracula.ts
│   ├── emberMonastery.ts
│   ├── githubLight.ts
│   ├── glacialInk.ts
│   ├── gruvboxDark.ts
│   ├── harborFog.ts
│   ├── light.ts
│   ├── midnightVelvet.ts
│   ├── monokai.ts
│   ├── mossCircuit.ts
│   ├── neonDusk.ts
│   ├── nord.ts
│   ├── obsidianBloom.ts
│   ├── oneDark.ts
│   ├── porcelainDaybreak.ts
│   ├── rosepine.ts
│   ├── sakuraTerminal.ts
│   ├── solarAsh.ts
│   ├── solarizedDark.ts
│   ├── solarizedLight.ts
│   ├── synthwaveHarbor.ts
│   ├── tokyoNight.ts
│   ├── toxicLimewire.ts
│   ├── ultravioletRain.ts
│   └── venice.ts
├── applyTheme.ts
├── applyTheme.test.ts
├── contrast.test.ts       # expanded all-theme WCAG matrix regression guard
├── contrast.ts
├── fallbacks.ts
├── fallbacks.test.ts
├── index.ts
├── themeTypes.ts
├── themes.test.ts         # built-in count + YAML starter coverage guard
├── themes.ts              # back-compat barrel
├── validateColor.ts
├── validateColor.test.ts
├── yamlTheme.ts
└── yamlTheme.test.ts
```

---

## `electron/` (main process + preload)

```
electron/
├── main.ts                # BrowserWindow factory + CSP + navigation guards
├── main.test.ts
├── preload.ts             # contextBridge API surface (only renderer-facing IPC origin)
├── ipc/                   # IPC handlers split per surface
│   ├── handlers.ts        # Venice, Ven-Forge app, chat, jina, scrape, character image cache
│   ├── configHandlers.ts  # config get / import / sanitised-write
│   ├── rpHandlers.ts      # 20 RP Studio channels
│   ├── updates.ts         # in-app updater channels
│   └── validation.ts      # Zod schemas for every IPC payload
├── services/              # main-process services (mirror of src/services for the trusted side)
│   ├── secureStore.ts     # safeStorage wrapper + Strict No-Plaintext Credential gate + profile password verifier
│   ├── guardPipeline.ts   # performGuardedVeniceRequest + screenResponseBody
│   ├── runtimeSafetySettings.ts  # canonical Family Safe Mode toggle (renderer cannot disagree)
│   ├── chatStorage.ts     # JSON-on-disk conversation persistence
│   ├── bridgeServer.ts    # headless Express loopback bridge (127.0.0.1, bearer token)
│   ├── characterCardStorage.ts
│   ├── rpChatStorage.ts
│   ├── rpSingleFileStore.ts
│   ├── rpStores.ts
│   ├── conversationVault.ts
│   ├── conversationWriteQueue.ts
│   ├── vaultMigration.ts
│   ├── mediaService.ts
│   ├── memoryPuller.ts
│   ├── configService.ts   # YAML bootstrap, secret redaction, sanitised writes
│   ├── researchBrowserServer.ts  # harden'd WebContentsView for Research Browser
│   ├── characterImageCache.ts    # allowlisted Venice character image cache
│   ├── veniceClient.ts    # main-process shared client
│   └── logger.ts          # redacting logger
├── security/
│   └── researchBrowserNetworkPolicy.ts  # HTTP allowlist for research WebContentsView
├── utils/
│   ├── urlSecurity.ts     # isTrustedExternalUrl + isPrivateHostname (POSIX inet_aton)
│   ├── navigation.ts      # will-navigate / will-frame-navigate handlers
│   ├── externalLinks.ts
│   ├── rendererCsp.ts     # CSP builder used in production packaging
│   ├── characterImageCacheProtocol.ts  # venice-character-cache:// protocol
│   ├── bridgeHost.ts
│   └── rateLimit.ts
```

---

## `tests/` (cross-cutting suites)

```
tests/
├── setup.ts
├── accessibility/         # reduced-motion, focus-trap, skip-link
├── csp/                   # production CSP invariants
├── electron/              # production-startup invariant test
├── safety/                # enforcement boundaries, guardPipeline, hydrationGate, veniceSafeMode
├── storage/               # character-card + rp-chat regression guards
├── rp/                    # promptBuilderService, lorebookService, rpMemory, characterCardService
├── smoke/
│   └── electron-smoke.test.ts  # Playwright; skipped when no display available
└── theme/                 # inline-color invariant + mesh-surface invariant
    ├── inlineColorInvariant.test.ts
    └── meshSurfaceInvariant.test.ts
```

---

## `scripts/` (dev + verify + bootstrap)

### Verify scripts (audited)

| Script | Role |
|--------|------|
| `verify-safety-guard.cjs` | Safety-guard presence at every boundary (mandatory CI gate) |
| `verify-image-policy.cjs` | Image policy + capability contract |
| `verify-network-boundaries.cjs` | SSRF / hostname policy / trusted URL checks |
| `verify-venice-api-docs.cjs` | Swagger ⟷ reference doc sync |
| `verify-work-orders.cjs` | Work-order cross-reference audit |
| `verify-web-contents-view.cjs` | Hardening audit for Research Browser |
| `verify-no-native-dialogs.cjs` | Theme-token discipline for dialog components |
| `verify-theme-tokens.cjs` | 29-role semantic token contract |
| `verify-storage-policy.cjs` | localStorage allowlist audit |
| `verify-storage-privacy.cjs` | Cross-store privacy dashboard contract |
| `verify-document-ingestion.cjs` | Ingestion extension coverage for chat input |
| `verify-research-workspace.cjs` | Research Workspace + citations |
| `verify-research-browser.cjs` | Phase 2I+ Research Web Expansion + Mini Browser |
| `verify-model-aware-recipes.cjs` | Phase 2A Image-model capability contract |
| `verify-media-studio-power-tools.cjs` | Phase 2B selection + bulk + compare + lineage |
| `verify-status-diagnostics.cjs` | Phase 2C Header Status Cluster + Diagnostics |
| `verify-prompt-library.cjs` | Phase 2D Prompt Library Foundation |
| `verify-scene-composer.cjs` | Phase 2E Scene Composer Foundation |
| `verify-rp-studio-polish.cjs` | Phase 2F RP Studio Polish |
| `verify-workflow-templates.cjs` | Phase 2G Workflow Templates |
| `verify-release-packaging-hardening.cjs` | Phase 2J Release/Packaging hardening |
| `verify-ci-contract.cjs` | CI/CD release config parity |
| `verify-agent-docs.cjs` | Handoff documentation parity |
| `verify-markdown-links.cjs` | Local Markdown link + heading fragment check |
| `verify-repo-handoff-hygiene.cjs` | handoff hygiene / gitignore parity |
| `verify-archive-clean.cjs` | Forbidden archive contaminants check |
| `verify-bundle-budget.cjs` | dist size budget |
| `verify-icon.cjs` | bundled icon existence/properties |
| `verify-dist.cjs` | build-output inspection by default; explicit platform modes verify packaged artifacts |
| `verify-archive-clean.test.ts` … `verify-release-packaging-hardening.test.ts` | Vitest suites for the verifier helpers |

### Bootstrap + packaging helpers

```
init-config.ts                # writes .config/*.example.yaml if missing
print-config.ts               # dumps validated YAML config to stdout
validate-config.ts            # parses + validates a YAML config
start-production.cjs          # NODE_ENV=production launcher for web build
clean-repo-zip.sh             # used by release workflows for clean ZIPs
checksum-release.cjs          # SHA-256 over packaged artifacts
build-electron.cjs            # tsc → dist-electron/
create-cjs-package.cjs        # writes CJS package.json into dist-electron/
generate-placeholder-icon.cjs # placeholder icon for early dev
profile-media-studio.mjs      # opt-in Playwright Electron profile for encrypted-media studios
capture-release-qa-snapshots.mjs
dev-tools/
├── capture-venice-design.mjs
├── capture-venice-styles.cjs
└── venice-styles.json
```

---

## `config/` and `config/themes/`

```
config/
└── themes/                  # 36 starter YAML theme templates (35 built-ins + example.theme.yaml)
    ├── amber-archive.yaml
    ├── arctic-glass.yaml
    ├── aurora-boreal.yaml
    ├── basalt-noir.yaml
    ├── circuit-mint.yaml
    ├── copper.yaml
    ├── catppuccin.yaml
    ├── cyber-orchid.yaml
    ├── dark.yaml
    ├── desert-copperfield.yaml
    ├── dracula.yaml          # Forge Dracula (canonical contrast baseline)
    ├── ember-monastery.yaml
    ├── example.theme.yaml    # canonical starter for ThemeMaker import
    ├── github_light.yaml
    ├── glacial-ink.yaml
    ├── gruvbox_dark.yaml
    ├── harbor-fog.yaml
    ├── light.yaml
    ├── midnight-velvet.yaml
    ├── monokai.yaml
    ├── moss-circuit.yaml
    ├── neon-dusk.yaml
    ├── nord.yaml
    ├── obsidian-bloom.yaml
    ├── one_dark.yaml
    ├── porcelain-daybreak.yaml
    ├── rosepine.yaml
    ├── sakura-terminal.yaml
    ├── solar-ash.yaml
    ├── solarized_dark.yaml
    ├── solarized_light.yaml
    ├── synthwave-harbor.yaml
    ├── tokyo_night.yaml
    ├── toxic-limewire.yaml
    ├── ultraviolet-rain.yaml
    └── venice.yaml
```

`.config/config.yaml` and `.config/themes.yaml` are gitignored local overrides.
`.config/*.example.yaml` are tracked.

---

## `build/` (icons only)

```
build/
├── icon.icns   # macOS
├── icon.ico    # Windows
└── icon.png    # Linux + splash
```

All other artifacts under `build/` are gitignored.

---

## `docs/` (canonical doc map)

See `docs/DOCS_INDEX.md` for the authoritative list. Quick map:

| Path | Purpose |
|------|---------|
| `docs/ABOUT.md` | Product overview |
| `docs/FAQ.md` | End-user FAQ |
| `docs/SUPPORT.md` | Support channel references (root SUPPORT.md is canonical) |
| `docs/legal/*` | Detailed disclaimer, notice, privacy, third-party notices, trademarks |
| `docs/DOCS_INDEX.md` | Navigation index map |
| `docs/FILE_TREE.md` | This file |
| `docs/ROADMAP.md` | Canonical open TODO roadmap |
| `docs/design/*` | First-party design notes (RP, Lorebooks, Media Studio, Memory, Public-Profile Discovery, Repository Tree, Scene Generation, Theme System, Venice UI Extraction) |
| `docs/DEVELOPMENT/*` | Building, BRIDGE, CONFIG, JINA_PROVIDER, macOS, platform-support, storage-policy, troubleshooting, research-browser |
| `docs/RELEASE/*` | release, repository-settings, SIGNED_ARTIFACT_EVIDENCE, signing-and-notarization |
| `docs/reference/*` | Venice API reference (`Venice_api_LLM_info.md`) + Swagger source (`Venice_swagger_api.yaml`) |
| `docs/audits/*` | Historical audit reports and verification fixtures (agent-repair-status, bug-cross-reference, CHANGELOG, docstrings-and-coverage-baseline, docstrings-and-coverage-final, document-ingestion-plan, exhaustive-bug-hunt, p0-closure-evidence, release_safety_gate, RESEARCH_PROVIDERS, security-quality-static-audit, work-orders) |
| `docs/archives/README.md` | History note on stale file removal |
| `docs/reports/CANONICAL_REPORT_INDEX.md` + `historical/*` | Report index and historical audits (final-massive-bug-hunt-with-proof, etc.) |
| `docs/superpowers/specs/*`, `plans/*` | SPM plan + spec drafts |
| `docs/summary_of_work.md` | Canonical AI/dev-agent session handoff ledger |


---

## Notes

- This file is the **source-of-truth directory map**. `docs/audits/REPOSITORY_TREE.md`
  may still list narratively; this file is the live tree.
- Files at the repo root that are NOT in the tree above: `.cursorrules`,
  `.windsurfrules`, `.editorconfig`, `.gitattributes`, `CLAUDE.md`, `GEMINI.md`.
  These are narrow-scope agent or VCS hints and are not user-facing inventory.
- The `docs/AGENTS/*` files are gitignored local-only agent scratch; do not
  reproduce them in CI-runnable docs (see VERIFY-034).
