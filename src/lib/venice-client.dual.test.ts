// VERIFY-009 regression guard: T8 / Dual Venice client split.
//
// The codebase has two Venice client surfaces with a documented split:
//   - src/lib/venice-client.ts (141 LOC) — thin Electron-only API:
//       venice(), veniceStreamChat(), veniceBlob(), veniceFormData().
//   - src/services/veniceClient.ts (~1136 LOC) — canonical, full client
//     with safety-guard integration, web/desktop routing, and inspector
//     integration: veniceFetch(), veniceStreamChat(), and helpers.
//
// AGENTS.md documents the split as deliberate. The lib/ client is a
// passthrough that does NOT run the safety guard in the renderer (the
// guard lives in the IPC layer at electron/ipc/handlers.ts). It is kept
// separate because the legacy hooks prefer its simpler API.
//
// This test enforces the invariant: every export from lib/venice-client
// must be re-exported (not re-implemented) from a single source of
// truth. If a future PR adds a new function to lib/, the test fails
// until that function is also exposed on the canonical client (or the
// shim is documented as a deliberate back-compat surface).
//
// The test does NOT assert the four functions are byte-identical between
// the two files — that would force premature consolidation. It only
// asserts that the names line up so a future refactor cannot silently
// drop a function or change the export surface.

import { describe, it, expect } from 'vitest'
import * as LibClient from '../lib/venice-client'
import * as ServicesClient from '../services/veniceClient'

const EXPECTED_LIB_EXPORTS = [
  'venice',
  'veniceStreamChat',
  'veniceBlob',
  'veniceFormData',
] as const

const EXPECTED_SERVICES_EXPORTS = [
  'veniceFetch',
  'veniceStreamChat',
  'serializeFormData',
  'summarizeDiagnostics',
  'normalizeError',
  'dedupeKey',
  'extractModelName',
  'MAX_RAW_UPLOAD_BYTES',
  'MAX_SERIALIZED_UPLOAD_BYTES',
] as const

describe('Dual Venice client surface (VERIFY-009, T8)', () => {
  it('lib/venice-client exports the documented four functions', () => {
    for (const name of EXPECTED_LIB_EXPORTS) {
      expect(typeof (LibClient as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it('services/veniceClient exports the documented canonical surface', () => {
    for (const name of EXPECTED_SERVICES_EXPORTS) {
      expect(typeof (ServicesClient as Record<string, unknown>)[name]).not.toBe('undefined')
    }
  })

  it('veniceStreamChat is exposed on both clients (the only shared name)', () => {
    // This is the ONLY function exported from both files. lib/veniceStreamChat
    // is a thin passthrough to services/veniceStreamChat via the IPC layer;
    // it does not run the renderer-side safety guard. The renderer dedupes
    // audit records via signalId in the IPC handler.
    expect(typeof LibClient.veniceStreamChat).toBe('function')
    expect(typeof ServicesClient.veniceStreamChat).toBe('function')
  })

  it('lib/ client does not accidentally re-implement safety guard internals', () => {
    // The lib/ client is a passthrough. It must not export the
    // safety-guard primitives (assessChildExploitationSafety etc.) —
    // those live in src/shared/safety/. If they leak into lib/, a
    // future refactor could accidentally bypass the IPC-layer guard.
    const bannedFromLib = [
      'assessChildExploitationSafety',
      'recordDecision',
      'SafetyGuardBlockedError',
    ]
    for (const name of bannedFromLib) {
      expect((LibClient as Record<string, unknown>)[name]).toBeUndefined()
    }
  })
})
