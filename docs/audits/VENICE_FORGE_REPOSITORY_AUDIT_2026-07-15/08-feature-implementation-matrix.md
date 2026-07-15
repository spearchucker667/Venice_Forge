# Feature Implementation Matrix

`src/config/tabs.ts`, the `App.tsx` view map, backing services/stores, persistence boundaries and relevant tests were cross-checked. “Implemented” means source/test-backed, not signed-installer or paid-account proof.

| Feature | UI | Service / IPC | Persistence | Tests | Status | Primary evidence |
|---|---|---|---|---|---|---|
| Chat | Yes | Venice stream + guarded IPC/proxy | Conversations | Yes | Implemented | `chat-view`, `chat-store`, Venice client |
| Character Chats | Yes | Hosted/local character routing | Conversations/cards | Yes | Implemented | tab registry, character chat tests |
| History | Yes | Paginated desktop/web storage | Dual-mode | Yes | Implemented | sidebar/history and storage tests |
| Image Studio | Yes | Model-capability payload boundary | Media/project | Yes | Implemented | `image-view`, `VERIFY-040/043` |
| Media Studio | Yes | bulk/send/export/lineage tools | Encrypted media | Yes | Implemented | `VERIFY-044`, gallery tests |
| Prompt Library | Yes | version/import/export store | Encrypted IDB | Yes | Implemented | `VERIFY-046` |
| Scene Composer | Yes | scene compiler/handoff | Encrypted IDB | Yes | Implemented | `VERIFY-047` |
| Audio Studio | Yes | TTS/transcription | TTS cache/media | Yes | Implemented; race fixed | `chatTtsController`, `VERIFY-126` |
| Music Studio | Yes | guarded generation/task polling | Task/media stores | Yes | Implemented | background task contracts |
| Video Studio | Yes | guarded generation/task polling | Task/media stores | Yes | Implemented | video and download containment tests |
| Embeddings | Yes | Venice embedding endpoint | view/result state | Yes | Implemented | endpoint validation and UI tests |
| Research | Yes | Jina/search/scrape + browser IPC | research store | Yes | Implemented | server/Electron response caps and smoke harness |
| Characters | Yes | hosted API + local card service | card storage | Yes | Implemented; error path fixed | CharacterLibrary tests |
| RP Studio | Yes | prompt compiler/scenarios/lore/personas | encrypted stores | Yes | Implemented | `VERIFY-048` and RP suites |
| Workflows | Yes | workflow engine/templates | encrypted stores | Yes | Implemented | workflow tests/contracts |
| Privacy | Yes | backup/import/sync/storage services | main + IDB | Yes | Implemented | `VERIFY-123/124` |
| Playground | Yes | model workflow builder | Zustand/IDB | Yes | Implemented | playground tests |
| Config | Yes | main-authoritative config/key custody | safeStorage/config | Yes | Implemented | config/auth tests |
| Status / diagnostics | Yes | safe snapshot and repair routing | safe snapshot | Yes | Implemented | `VERIFY-045` |

Explicitly not advertised as implemented: direct WebDAV/S3-compatible sync, live sync-set key rotation, scheduled provider-key rotation, and six deferred providers. Their adapters fail closed and remain locked by `VERIFY-125`.

Runtime-only evidence still needed for the signed, credentialed, paid-operation, two-device and accessibility matrix is listed in `17-unverified-runtime-risks.md` and canonical roadmap item `VF-VERIFY-005`.
