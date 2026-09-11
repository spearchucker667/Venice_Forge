# Decision Record: Semantic Media Classifier Backend

**ID:** VF-FSM-CLASSIFIER-DECISION-2026-09-01
**Date:** 2026-09-01
**Status:** Decided / implementation deferred
**Scope:** Family Safe Mode (FSM) generated-media semantic screening
**Related code:** `src/shared/safety/mediaScreener.ts`, `electron/services/backgroundTaskManager.ts`
**Related roadmap item:** `VF-FSM-CLASSIFIER-2026-08-31`

## Context

Venice Forge currently performs only **structural generated-media validation** when Family Safe Mode is enabled. The structural gate (`src/shared/safety/mediaScreener.ts`) verifies magic bytes, MIME consistency, minimum viable size, and anomalous dimensions (e.g., tracking pixels). It does **not** perform semantic content classification of image, audio, or video payloads.

`VF-AUD-20260831-P2-009` added `getClassifierCapabilities()` to truthfully expose this state. The capability descriptor reports `semanticImageClassifier: "unavailable"`, `semanticAudioClassifier: "unavailable"`, and `semanticVideoClassifier: "unavailable"` in production builds, with a `ClassifierBackend` registration hook reserved for a future ML backend.

This decision record compares the two candidate backend strategies—**local on-device classification** and **provider-side classification**—and selects the path that best aligns with Venice Forge's architecture, privacy model, and threat model.

## Decision

**Adopt a local on-device semantic classifier for images as the canonical next backend. Defer provider-side semantic classification unless the local approach proves insufficient for mandatory child-safety or legal compliance requirements.**

Audio and video semantic classification remain **explicitly out of scope** until a mature open-model option exists; the structural gate and provider terms-of-service enforcement remain the only FSM controls for those modalities.

## Candidate Comparison

### 1. Local On-Device Classifier

A local backend would run inside the Electron main process (or an isolated worker) using a bundled ML runtime and model weights. For images, the most mature open-source option is an NSFW detection model (e.g., `nsfwjs`-style MobileNetV2/ResNet classifier) executed via TensorFlow.js, ONNX Runtime, or a future WebNN backend.

#### Benefits

| Benefit | Rationale |
|---------|-----------|
| **Privacy-first** | Generated media never leaves the user's device for classification. This is consistent with Venice Forge's local-first storage model and reduces the risk of sensitive images being logged or retained by a third party. |
| **No per-request cost** | After the one-time model download/bundle, inference is local. There is no metered API cost or rate-limit exposure for FSM checks. |
| **Works offline** | Classification continues when the device has no network connectivity. |
| **Predictable latency** | No network round-trip; inference time is bounded by local CPU/GPU capacity. |
| **No additional provider approval or keys** | Does not require a new API key, OAuth flow, or endpoint allowlist beyond the existing Venice generation contract. |
| **No CSP/IPC boundary expansion** | Keeps media bytes inside the main process and avoids adding new external origins to the content security policy. |

#### Costs and Risks

| Cost/Risk | Rationale |
|-----------|-----------|
| **Bundle size increase** | Image classification models add roughly 5–25 MB of weights to the installer, depending on architecture and quantization. This affects download size, update bandwidth, and disk usage. |
| **Runtime memory and CPU/GPU load** | Model inference competes with generation, rendering, and other background tasks. On low-end devices this may cause stuttering or battery drain. |
| **Accuracy and update cadence** | Open models lag behind hosted services in accuracy, adversarial robustness, and coverage of emerging harms. Updates require a new release or an explicit model-download mechanism. |
| **False positive/negative trade-off** | A conservative model may block legitimate content; a permissive model may miss policy violations. Calibration must respect the existing `CLASSIFIER_BLOCK` / `CLASSIFIER_UNAVAILABLE` contract. |
| **Native dependency complexity** | TensorFlow.js-node or ONNX Runtime for Electron requires platform-specific native bindings, signing/notarization considerations, and careful supply-chain review. |
| **Audio/video gap** | No comparable open semantic classifier exists for audio or video. Those modalities would still require a provider or remain structurally validated only. |

### 2. Provider-Side Classifier

A provider backend would upload generated media bytes (or a signed URL) to an external classification service such as Venice's own safety endpoint, Google Cloud Vision, AWS Rekognition, or another specialized API.

#### Benefits

| Benefit | Rationale |
|---------|-----------|
| **Higher accuracy** | Hosted services typically offer state-of-the-art detection, continuous retraining, and broader harm categories. |
| **Lower local resource usage** | No model weights, GPU drivers, or inference runtime in the application bundle. |
| **Consistent policy alignment** | If Venice.ai exposes a native safe-mode/classification endpoint, results map directly to provider terms-of-service enforcement. |
| **Potential audio/video support** | Some cloud providers offer multi-modal moderation APIs that could cover image, audio, and video with one integration. |

#### Costs and Risks

| Cost/Risk | Rationale |
|-----------|-----------|
| **Privacy erosion** | Every generated image must be sent to a third party. This contradicts the local-first product positioning and increases the attack surface for exfiltration, logging, or subpoena exposure. |
| **Per-request cost and rate limits** | Classification becomes a billable, rate-limited operation. This changes the unit economics of FSM and could degrade user experience at scale. |
| **Network dependency** | Classification cannot occur offline and adds latency to every generation. |
| **CSP and IPC boundary expansion** | Requires adding new external origins, request signing, and possibly credential management. Each new endpoint is a new trust boundary to validate. |
| **Consent complexity** | Users must be informed that generated media is leaving the device for inspection, which may require an explicit opt-in flow for sensitive content. |
| **Vendor lock-in** | Model behavior, availability, and pricing are controlled by the provider. Switching providers requires a new adapter and possible UI/contract changes. |

## Architectural Constraints

The existing `ClassifierBackend` interface is intentionally narrow:

```ts
export interface ClassifierBackend {
  classifyImage(buffer: Buffer, mimeType: string): Promise<GeneratedMediaSafetyResult>;
}
```

This supports a local backend with minimal changes:

- Load the model once at main-process startup.
- Register the backend via `registerClassifierBackend()`.
- `classifyGeneratedImage()` delegates to the registered backend when present.
- `getClassifierCapabilities()` reports `semanticImageClassifier: "local"`.

A provider backend would require additional scaffolding:

- A provider adapter implementing `ClassifierBackend`.
- Secure credential retrieval (already available via `desktopBridge.getSecureConfig()` / main-process secure storage).
- Endpoint allowlisting in `electron/services/guardPipeline.ts` or CSP.
- Redaction of media bytes in diagnostics (already required by the secrets policy).
- Deduplication and caching to avoid classifying the same payload twice.

## Recommendation and Gating Conditions

1. **Proceed with a local image classifier** when the following conditions are met:
   - A reviewed model and runtime are selected (e.g., quantized ONNX MobileNetV2-based NSFW detector).
   - The bundle-size increase is approved by the release/packaging owner.
   - Native dependencies pass supply-chain review and are compatible with macOS, Windows, and Linux Electron builds.
   - Accuracy is validated against an internal test corpus with acceptable false-positive and false-negative rates.
   - The `getClassifierCapabilities()` contract is updated to report `"local"` for images and `"unavailable"` for audio/video.

2. **Re-evaluate provider-side classification only if**:
   - A legal or compliance requirement mandates detection classes that the local model cannot reliably cover.
   - Venice.ai exposes a first-party safe-mode/classification endpoint that is contractually acceptable and privacy-aligned.
   - Audio or video semantic classification becomes a product requirement before a viable open model exists.

3. **Audio and video remain structurally validated only** until a clear, privacy-respecting semantic backend is identified.

## Implementation Notes (Deferred)

This record does **not** implement a classifier. When implementation begins, the following boundaries must be respected:

- Do not add ML dependencies to the renderer or preload.
- Keep model weights out of the repository; use a build-time fetch/bundle step or runtime download with integrity verification.
- Never log raw media bytes, classification inputs, or model outputs.
- Preserve the existing `GeneratedMediaSafetyResult` contract; blocked results must continue to set `reasonCode`, `category`, and `userMessage`.
- Ensure `clearClassifierBackend()` and `_getRegisteredBackend()` remain available for tests.
- Add focused regression tests that verify delegation to a registered backend and the capability descriptor update.

## Consequences

- **Positive:** The product direction remains privacy-first; generated media is screened on-device when semantic classification ships.
- **Positive:** No new external network boundary, credential store entry, or CSP exception is introduced for this feature.
- **Negative:** Bundle size and local resource usage will increase when the local model is integrated.
- **Negative:** Image classification accuracy is bounded by open-model quality unless a provider fallback is later added.
- **Neutral:** Audio and video semantic classification are explicitly deferred; the capability descriptor will continue to report `"unavailable"` for those modalities.

## References

- `src/shared/safety/mediaScreener.ts` — classifier interface, structural heuristic, capability descriptor.
- `src/shared/safety/mediaScreener.test.ts` — capability descriptor and structural validation tests.
- `docs/ROADMAP.md` — `VF-FSM-CLASSIFIER-2026-08-31` roadmap item.
- `docs/reports/historical/DEFERRED_WORK_DECISION_RECORD.md` — earlier `VF-FSM-003` deferred-work note.
