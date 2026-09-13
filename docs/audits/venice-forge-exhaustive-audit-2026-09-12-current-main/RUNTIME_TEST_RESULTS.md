# Runtime Test Results

## Automated / packaged runtime tests

No packaged Electron runtime tests were executed during this audit.

- `tests/smoke/` entries are gated by `process.env.RUN_ELECTRON_SMOKE === 'true'`. This environment was not set.
- Running `npm run dev:electron` or packaging would require additional time and a headed/display environment; the audit prioritized static/source-level correctness.
- The CSP `venice-tts:` media-src defect (VF-AUD-20260912-SEC-P1-001) was empirically validated with an out-of-tree minimal Electron 43.2.0 probe, not the full application.

## Manual runtime observations

None. All findings are derived from source inspection, verifier output, and the out-of-tree CSP probe described above.

## Recommended runtime validation before release

1. Packaged macOS smoke: launch app, complete onboarding, enter API key, verify model list loads.
2. Packaged TTS smoke: in chat, trigger TTS and confirm audio plays without CSP violation (validates VF-AUD-20260912-SEC-P1-001 and VF-AUD-20260912-VCS-P1-001).
3. Streaming FSM smoke: enable Family Safe Mode, start a streaming chat with a guard-triggering response, confirm zero deltas reach the UI (validates VF-AUD-20260912-GSS-P1-001 and VF-AUD-20260912-VCS-P1-004).
4. RP chat smoke: open a character chat, send a message, verify the request reaches Venice with `stream: true` and no invented `endpoint` field (validates VF-AUD-20260912-VCS-P1-003).
5. Vault save smoke: on Electron, create a conversation and confirm it is saved in the vault, not silently demoted to legacy storage (validates VF-AUD-20260912-IPC-P1-001).
