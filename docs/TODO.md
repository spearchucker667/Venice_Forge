# Comprehensive Bug & Defect Report

## Critical Severity (Data Loss, Security, Crash, Core Logic Failure)

1. [FIXED] Jina API Key is Configured but Never Transmitted
   - **Location:** `src/modules/SearchScrapeModule.tsx`, `src/services/desktopBridge.ts`, and `electron/preload.ts`
   - **Description:** Missing IPC exposure in `preload.ts` meant the configured Jina API Key couldn't be loaded on startup in the React renderer.
   - **Remediation:** Added `jinaApiKey:get` IPC handler to `preload.ts` and `desktopBridge.ts`.

2. [FIXED] Generic HTTP Scrape Provider Vulnerable to SSRF via DNS Resolution
   - **Location:** `src/research/providers/genericHttpScrapeProvider.ts`, `server.ts`, and `electron/ipc/handlers.ts`
   - **Description:** The string-only check for private IPs allowed an attacker to bypass SSRF protection by using a custom domain that resolves to a private IP (DNS rebinding).
   - **Remediation:** Migrated the scrape functionality to dedicated backend proxies (`app:proxyScrape` for Electron, `/api/proxy-scrape` for Express) that enforce `dns.lookup` before executing the request.

3. [FIXED] Child Exploitation Safety Bypass via Base64 `_isSerializedFormData`
   - **Location:** `src/shared/safety/promptPayloadExtractor.ts`
   - **Description:** During IPC transmission, `veniceClient.ts` serialized `FormData` `File` blobs into Base64 strings. The safety guard attempted to run text-based regex on these raw Base64 strings, failing to identify CSAM content embedded in uploaded text files.
   - **Remediation:** Updated `extractFromSerializedFormData` to decode the Base64 string to UTF-8 before applying the safety analysis.

## High Severity (Bypasses, Major Functional Issues)

4. [FIXED] Rate Limiter LRU Eviction Logic Allows Attacker Bypass
   - **Location:** `server.ts`
   - **Description:** Logic errors in the `reqCounts` mapping allowed attackers to continuously flood the proxy and evade the rate limit by manipulating the `lastSeen` timestamp and triggering LRU eviction.
   - **Remediation:** Standardized the `lastSeen` tracking and corrected the LRU eviction algorithms for both the main and static rate limiters.

5. [FIXED] `isTrustedExternalUrl` IPv4 Short-Form Normalization is Mathematically Incorrect
   - **Location:** `electron/utils/urlSecurity.ts`
   - **Description:** The custom `normalizeShortIpv4` handled integer IP representations incorrectly, causing IP addresses like `127.12345` to evade the security check while actually resolving to `127.0.48.57` (a private IP).
   - **Remediation:** Replaced the incorrect short-form IPv4 padding logic with a compliant POSIX `inet_aton` algorithm to accurately identify private IPs.

6. [FIXED] Proxy Circuit Breaker Failure Count Reset Logic
   - **Location:** `server.ts`
   - **Description:** Circuit breaker incorrectly reset its failure count instantly without waiting for a successful probe request in the `HALF-OPEN` state.
   - **Remediation:** Implemented `circuitHalfOpen` state that only resets failure counts after a successful probe request.

## Medium Severity (UI/UX, Mild Edge Cases)

7. [FIXED] `desktopJinaApiKey.set` Throws Unhandled Error in Web Mode
   - **Location:** `src/services/desktopBridge.ts`
   - **Description:** Setting the Jina API key crashed the application when running in the Web Server environment.
   - **Remediation:** Added `localStorage` fallback functionality in `desktopBridge.ts` for developers running the app outside Electron.

8. [FIXED] `veniceClient.ts` Model Extraction Misses Deeply Nested Values
   - **Location:** `src/services/veniceClient.ts`
   - **Description:** Nested `{ model: "..." }` properties evaded extraction telemetry.
   - **Remediation:** Added `findModelRecursively` to safely parse deeply nested response models.
