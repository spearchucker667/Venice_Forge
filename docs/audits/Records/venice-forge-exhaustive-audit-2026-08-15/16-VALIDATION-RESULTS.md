# Validation Results

## Executed baseline

| Command | Result | Evidence summary |
|---|---|---|
| `test "$(git branch --show-current)" = "main"` | PASS | Local `main` confirmed before edits |
| Git status/remotes/upstream/recent log | PASS | Clean start; `bc5c1737` matched `origin/main` |
| `npm run docs:venice:sync` | PASS | Upstream mirror refreshed to `6e69346b…`; Swagger `20260814.194349` |
| `npm run lint:eslint` | PASS | Exit 0, zero warnings by script contract |
| `npm run typecheck` | PASS | Renderer and Electron TypeScript projects clean |
| `npm test` | PASS | 451 files passed, 1 skipped; 4,934 tests passed, 1 skipped; 361.59s |
| Focused Venice stream/chat tests | PASS | 4 files, 43 tests; confirms existing suite does not cover identified boundaries |

Additional post-documentation gates and final Git publication evidence are appended after execution; no command is marked passed before it runs.

## Reproduction status

- Request-shape findings were reproduced by tracing concrete constructed objects against strict current Swagger schemas.
- The preload loss is a deterministic field-drop visible in the callback reconstruction.
- Retry duplication is deterministic from the same assistant accumulator and repeated dispatch loop.
- Direct standalone import of the Electron SSE module was blocked by Electron’s runtime-only ESM export behavior; the static state-machine trace and passing-but-incorrect unit expectation provide direct evidence. Remediation must add a transport-neutral reproduction.

## Not executed

No paid Venice generation, signed installer, Windows/Linux runtime, second-device sync, or forced-crash destructive test was executed. These require credentials, budget authorization, signing infrastructure, or unavailable hosts.
