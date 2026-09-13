# Rejected Findings — audit of `main` @ `c6d9bed3`

Candidates investigated during this pass that did **not** withstand verification, recorded
per work order §38 so future audits do not re-derive them.

---

**Candidate 1:** `chatTtsBridge.synthesizeSpeech` writes the TTS cache via raw
`fs.rename` after a unique temp file, which the `c6d9bed3` commit message itself calls a
Windows-incompatible pattern — suspected P2 defect.

**Result:** REJECTED as a defect at this audit's severity bar; partially absorbed into
design risk `C6-DR-001` and improvement `IMP-1`.

**Reason:** The rename targets a cache path named by a sha256 content key. If the
destination exists, the earlier `stat` hit in this function returns the cached-audio
shortcut and the rename never executes; a rename failure therefore only occurs on a
near-simultaneous duplicate synthesis of identical audio, where the losing write's
`finally` cleanup removes the temp and the surviving file is correct. Failure mode is a
one-request error, not corruption. Still worth migrating to `atomicReplaceFile()` for
uniformity (tracked under DR-001), but it does not meet P3 as a standalone bug.

---

**Candidate 2:** Packaged renderer has no enforced `script-src` CSP because
`onHeadersReceived` does not intercept `file://` loads and `dist/index.html` carries no
meta CSP — suspected P0 security defect.

**Result:** NOT A DEFECT.

**Reason:** Differential runtime evidence (see `RUNTIME_TEST_RESULTS.md`): page-context
inline event-handler attributes and DOM-injected inline scripts **are** blocked in the
packaged app and `securitypolicyviolation` fires, proving header-based CSP enforcement
reaches the file:// renderer on the current Electron line (behavior has changed from the
historical Chromium limitation; `loadFile` responses do traverse `onHeadersReceived` in
Electron 43). The failing smoke assertion is a probe-method artifact (C6-P1-001), not
missing enforcement.

---

**Candidate 3:** 55 `__MISSING__` i18n sentinel placeholders across non-en locales mean
the shipped UI shows raw keys — suspected localization defect.

**Result:** NOT A DEFECT (for this baseline).

**Reason:** `verify:i18n` runs under the repository's explicit
`--allow-missing-markers` contract; the runtime translator falls back to the en-US
source string (observed in test stderr: "55 missing-marker entries fell back to
'en-US'"), so users see English, not keys. Strict-mode release gating and native review
are tracked in ROADMAP (`VF-I18N-NATIVE-REVIEW-001`). Noted as IMP-3.

---

**Candidate 4:** `guardPipeline.performGuardedVeniceRequest` buffers *all* deltas while
FSM is on and releases them only after full screening — suspected unbounded memory
growth on long streams.

**Result:** REJECTED (bounded in practice, acceptable trade).

**Reason:** Withholding is the intended post-GSS-P1-001 contract — deltas must not reach
the renderer before the aggregated body passes screening; releasing early would reintroduce
the defect. Chat responses are bounded by `max_completion_tokens`; memory use is
proportional to one response. No change recommended.

---

**Candidate 5:** `use-chat.ts` / chat-store flush timers could leak when a conversation
is deleted mid-stream.

**Result:** NOT REPRODUCIBLE.

**Reason:** `discardStreamDelta` clears both the timer map and pending deltas on block/
failure; `stopStream` flushes then aborts; deletion paths route through store actions
that clear per-conversation state, and `startStream`'s generation counter prevents a
stale finally from resurrecting state. No leak path found under the traced scenarios.

---

**Candidate 6:** `new URL(request.url)` on custom-protocol URLs with whitespace/invalid
hosts could throw inside `protocol.handle` and crash the handler — suspected robustness
defect in `main.ts:404-460`.

**Result:** REJECTED.

**Reason:** Every handler wraps parse-and-serve in try/catch returning typed error
Responses (verified for character-cache; tts/media validate components before
constructing paths), and Electron's `protocol.handle` isolates handler exceptions from
the main process event loop regardless. Malformed URLs yield 4xx responses, not crashes.
