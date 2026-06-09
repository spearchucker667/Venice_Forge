# LocalStorage Access Policy

Venice Forge treats `localStorage` as a **restricted, best-effort surface**.
Secrets, conversation content, and raw prompts must never be written there.

## Allowed call sites

| File | Purpose | Marker |
|------|---------|--------|
| `src/lib/safe-storage.ts` | Zustand persist wrapper for the settings store. No secrets. | `zustand persist safeStorage wrapper` |
| `src/services/modelService.ts` | Transient model-list cache (stale-while-revalidate, no secrets). | `transient model-list cache` |
| `src/services/storageMaintenance.ts` | Clears the transient model cache on user request. | `transient model-list cache` |
| `src/hooks/useThemeLifecycle.ts` | Theme bootstrap cache to avoid FOUC on reload. | `theme bootstrap FOUC cache` |
| `src/App.tsx` | Theme bootstrap cache + first-run legal acknowledgment gate. | `theme bootstrap FOUC cache` / `first-run legal ack` |
| `src/services/promptStarterService.ts` | Ephemeral prompt-starter rotation tracking only. | `prompt-starter rotation tracking` |

## Marker format

Every direct `localStorage` access must carry an inline marker comment:

```ts
localStorage.getItem(key) /* localStorage-allowed: <reason> */
```

## Enforcement

`scripts/verify-storage-policy.cjs` scans `src/` and fails the build if any
`localStorage` call is missing the marker or appears in an unlisted file.
Run it with:

```bash
node scripts/verify-storage-policy.cjs
```

It is included in the `ci` parity command via `npm run verify:storage-policy`.
