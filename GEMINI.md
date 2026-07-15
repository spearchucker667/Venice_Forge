# Canonical path: /Users/super_user/Projects/Venice_Forge
# Historical path Windows-Venice-API-connector must not be used.

# Agent Instructions

Canonical repository instructions live in [AGENTS.md](AGENTS.md). Follow AGENTS.md only, including the mandatory `docs/summary_of_work.md` handoff; this file exists as a tool-discovery pointer.

## Canonical Repository

- Local path: `/Users/super_user/Projects/Venice_Forge`
- GitHub: `spearchucker667/Venice_Forge`
- Application: Venice Forge Electron desktop app
- Stack: Electron 42, React 19, TypeScript strict, Zustand, Vitest
- Node: `>=22.13.0 <23.0.0`

Run the local bootstrap check in `AGENTS.md` before editing. Do not use the
historical repository name `Windows-Venice-API-connector`; the check is
local-only and must never be added to CI.

```bash
EXPECTED_ROOT="/Users/super_user/Projects/Venice_Forge"
if [[ "$(pwd -P)" != "$EXPECTED_ROOT" ]]; then
  echo "Wrong repository root."
  echo "Expected: $EXPECTED_ROOT"
  echo "Actual:   $(pwd -P)"
  exit 1
fi
test -f package.json
test -f AGENTS.md
test -d src
test -d electron
```
