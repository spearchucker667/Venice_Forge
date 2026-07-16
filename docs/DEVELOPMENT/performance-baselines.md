# Performance Baselines

Large modules are review-risk indicators, not automatic runtime defects. Decomposition is authorized only when profiling shows excess render work, repeated I/O, bundle pressure, or coupling that prevents safe testing.

## 2026-07-16 measurements

- Production build passes. Main chunks are approximately 499.55 KiB and 490.72 KiB against a 600 KiB cap.
- `desktopBridge.ts` is 1,270 lines, `CharacterEditor.tsx` 1,278, `gallery-view.tsx` 1,004, and `image-view.tsx` 897.
- Existing `VERIFY-138` tests bound Header/Sidebar/chat streaming subscriptions with 500-model, 1,000-summary, 100-message, and 1,000-delta fixtures.
- Removing audit-confirmed unreachable modules did not materially reduce bundles because Vite already excluded them from production entrypoint reachability.

## Profiling matrix before refactor

1. Capture React commit counts and durations for Chat, Sidebar, Image Studio, Character Editor, Gallery, and Settings using representative large fixtures.
2. Capture main/background watcher CPU and filesystem operation counts during sync startup, steady state, conflict replay, and shutdown.
3. Record before/after bundle assets and `verify:bundle-budget` output.
4. Refactor a domain only when the proposed boundary removes broad subscriptions, isolates a state machine/transport, or extracts a pure schema/request adapter with focused tests.

Cosmetic file splitting without a measured coupling or responsiveness improvement is out of scope.
