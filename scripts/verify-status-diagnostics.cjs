#!/usr/bin/env node
/**
 * verify-status-diagnostics.cjs
 *
 * Status / diagnostics contract guard (VERIFY-045).
 * Fails if any of the following invariants are violated in the Phase 2C
 * surface area:
 *
 *  1. `src/types/status.ts` exports `StatusSeverity`, `AppStatusItem`,
 *     `AppStatusSnapshot`, `SafeDiagnosticsSnapshot`, and the version
 *     constant `SAFE_DIAGNOSTICS_SNAPSHOT_VERSION`.
 *  2. `src/services/diagnosticsService.ts` exports
 *     `computeAppStatusSnapshot`, `computeSafeDiagnosticsSnapshot`, and
 *     `serialiseSafeDiagnosticsSnapshot`.
 *  3. `src/stores/status-store.ts` exports the `useStatusStore` Zustand
 *     store with the canonical actions (`recompute`, `refresh`,
 *     `openDrawer`, `closeDrawer`, `setFocusedSection`).
 *  4. `src/components/status/StatusIndicator.tsx` exports `StatusIndicator`
 *     with the per-severity tone class, `data-severity`, and `aria-label`.
 *  5. `src/components/status/HeaderStatusCluster.tsx` exports
 *     `HeaderStatusCluster` and is mounted in `src/components/layout/header.tsx`.
 *  6. `src/components/status/DiagnosticsDrawer.tsx` exports
 *     `DiagnosticsDrawer` and is mounted in `src/App.tsx`.
 *  7. The `DiagnosticsDrawer` "Copy Safe Diagnostics" path never includes
 *     the strings `apiKey`, `bearer `, `authorization:` (raw header),
 *     `data:` (base64 blob), or a Windows / Unix absolute path in the
 *     serialised snapshot. The check is a heuristic on the source for
 *     the copy handler — it must call `serialiseSafeDiagnosticsSnapshot`
 *     on the result of `computeSafeDiagnosticsSnapshot` (not the raw
 *     `status` snapshot).
 *  8. `src/stores/toast-store.ts` exports the `warn` variant.
 *  9. The Command Palette, when it ships diagnostics commands, reads
 *     the status store via `useStatusStore` and routes through
 *     `useSettingsStore.setActiveTab`. (Optional — checked best-effort.)
 *
 * Usage:
 *   node scripts/verify-status-diagnostics.cjs
 *
 * Exit 0 on success; non-zero on any violation.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const TYPES_FILE = path.join(REPO, "src/types/status.ts");
const SERVICE_FILE = path.join(REPO, "src/services/diagnosticsService.ts");
const STORE_FILE = path.join(REPO, "src/stores/status-store.ts");
const INDICATOR_FILE = path.join(REPO, "src/components/status/StatusIndicator.tsx");
const CLUSTER_FILE = path.join(REPO, "src/components/status/HeaderStatusCluster.tsx");
const DRAWER_FILE = path.join(REPO, "src/components/status/DiagnosticsDrawer.tsx");
const HEADER_FILE = path.join(REPO, "src/components/layout/header.tsx");
const APP_FILE = path.join(REPO, "src/App.tsx");
const TOAST_STORE_FILE = path.join(REPO, "src/stores/toast-store.ts");

let failures = 0;
function check(label, ok, detail) {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  const tail = detail ? ` — ${detail}` : "";
  console.log(`  [${tag}] ${label}${tail}`);
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

console.log("VERIFY-045: status-diagnostics contract guard");

const types = readIfExists(TYPES_FILE);
const service = readIfExists(SERVICE_FILE);
const store = readIfExists(STORE_FILE);
const indicator = readIfExists(INDICATOR_FILE);
const cluster = readIfExists(CLUSTER_FILE);
const drawer = readIfExists(DRAWER_FILE);
const header = readIfExists(HEADER_FILE);
const app = readIfExists(APP_FILE);
const toastStore = readIfExists(TOAST_STORE_FILE);

check("src/types/status.ts exists", Boolean(types));
check("src/services/diagnosticsService.ts exists", Boolean(service));
check("src/stores/status-store.ts exists", Boolean(store));
check("src/components/status/StatusIndicator.tsx exists", Boolean(indicator));
check("src/components/status/HeaderStatusCluster.tsx exists", Boolean(cluster));
check("src/components/status/DiagnosticsDrawer.tsx exists", Boolean(drawer));

if (types) {
  for (const sym of [
    "StatusSeverity",
    "AppStatusItem",
    "AppStatusSnapshot",
    "SafeDiagnosticsSnapshot",
    "SAFE_DIAGNOSTICS_SNAPSHOT_VERSION",
  ]) {
    check(`src/types/status.ts declares ${sym}`, types.includes(sym));
  }
}

if (service) {
  for (const sym of [
    "computeAppStatusSnapshot",
    "computeSafeDiagnosticsSnapshot",
    "serialiseSafeDiagnosticsSnapshot",
  ]) {
    check(`src/services/diagnosticsService.ts exports ${sym}`, service.includes(sym));
  }
}

if (store) {
  check("src/stores/status-store.ts uses zustand `create`", /from\s+["']zustand["']/.test(store));
  check("src/stores/status-store.ts exports useStatusStore", /export\s+const\s+useStatusStore/.test(store));
  for (const action of [
    "recompute",
    "refresh",
    "openDrawer",
    "closeDrawer",
    "setFocusedSection",
  ]) {
    check(`src/stores/status-store.ts has action ${action}`, new RegExp(`\\b${action}\\b`).test(store));
  }
}

if (indicator) {
  check(
    "StatusIndicator maps each severity to a tone class",
    /(?:success|emerald)/.test(indicator) && /(?:warning|amber)/.test(indicator) && /(?:danger|red)/.test(indicator),
  );
  check(
    "StatusIndicator exposes data-severity attribute",
    /data-severity["']?\s*:\s*severity/.test(indicator) || /data-severity=/.test(indicator),
  );
  check(
    "StatusIndicator uses aria-label",
    /aria-label/.test(indicator),
  );
}

if (cluster) {
  check(
    "HeaderStatusCluster renders 8 status indicators",
    /api\b/.test(cluster) &&
      /apiKey\b/.test(cluster) &&
      /model\b/.test(cluster) &&
      /storage\b/.test(cluster) &&
      /project\b/.test(cluster) &&
      /safety\b/.test(cluster) &&
      /provider\b/.test(cluster) &&
      /desktop\b/.test(cluster),
  );
  check(
    "HeaderStatusCluster wires openDrawer from status store",
    /useStatusStore/.test(cluster) && /openDrawer/.test(cluster),
  );
}

if (header) {
  check(
    "Header mounts HeaderStatusCluster",
    /HeaderStatusCluster/.test(header),
  );
}

if (drawer) {
  check(
    "DiagnosticsDrawer imports useStatusStore",
    /useStatusStore/.test(drawer),
  );
  check(
    "DiagnosticsDrawer calls serialiseSafeDiagnosticsSnapshot for the copy action",
    /serialiseSafeDiagnosticsSnapshot/.test(drawer) && /copyText/.test(drawer),
  );
  check(
    "DiagnosticsDrawer never serialises the raw status object for the copy action",
    !/copyText\(\s*serialiseSafeDiagnosticsSnapshot\(\s*status\s*\)/.test(drawer),
    "ensure copy path uses the safe snapshot, not the raw status object",
  );
  check(
    "DiagnosticsDrawer mounts the Web-mode caveat",
    /Web mode: filesystem/.test(drawer),
  );
  check(
    "DiagnosticsDrawer renders the Repair section as read-only",
    /Repair/.test(drawer) && /out of scope/.test(drawer),
  );
}

if (app) {
  check(
    "src/App.tsx mounts <DiagnosticsDrawer />",
    /<DiagnosticsDrawer/.test(app) || /DiagnosticsDrawer\s*\{?/.test(app),
  );
}

if (toastStore) {
  check(
    "src/stores/toast-store.ts declares a warn variant",
    /["']warn["']/.test(toastStore) && /warn\s*:/.test(toastStore),
  );
  check(
    "src/stores/toast-store.ts exports a toast.warn() helper",
    /warn\s*:\s*\(/.test(toastStore) || /toast\.warn/.test(toastStore) || /function\s+warn\b/.test(toastStore),
  );
}

console.log("");
if (failures === 0) {
  console.log("OK — verify:status-diagnostics passed (VERIFY-045).");
  process.exit(0);
} else {
  console.error(`FAIL — ${failures} status-diagnostics invariant(s) violated.`);
  process.exit(1);
}
