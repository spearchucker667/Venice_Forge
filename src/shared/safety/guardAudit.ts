/**
 * @fileoverview In-memory safety guard audit counters.
 *
 * Records aggregate decision statistics ONLY — no raw prompt text, matched terms,
 * or any user-controlled content is ever stored here.
 */

import type { SafetyGuardDecision, SafetyGuardCategory, SafetyGuardSeverity } from "./childExploitationGuard.js";

export interface GuardAuditSnapshot {
  allowed: number;
  warned: number;
  blocked: number;
  bySeverity: Record<SafetyGuardSeverity, number>;
  byCategory: Partial<Record<SafetyGuardCategory, number>>;
  lastDecisionAt: string | null;
  lastReasonCode: string | null;
}

const counters = {
  allowed: 0,
  warned: 0,
  blocked: 0,
  bySeverity: {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  } as Record<SafetyGuardSeverity, number>,
  byCategory: {} as Partial<Record<SafetyGuardCategory, number>>,
  lastDecisionAt: null as string | null,
  lastReasonCode: null as string | null,
};

/** Records a guard decision into the in-memory counters. No content is stored. */
export function recordDecision(decision: SafetyGuardDecision): void {
  counters.lastDecisionAt = decision.audit.createdAt;
  counters.lastReasonCode = decision.reasonCode;
  counters.bySeverity[decision.severity] = (counters.bySeverity[decision.severity] ?? 0) + 1;
  counters.byCategory[decision.category] = (counters.byCategory[decision.category] ?? 0) + 1;

  if (!decision.allow || decision.action === "block") {
    counters.blocked++;
  } else if (decision.action === "warn") {
    counters.warned++;
  } else {
    counters.allowed++;
  }
}

/** Returns a snapshot of the current audit counters. */
export function getAuditSnapshot(): GuardAuditSnapshot {
  return {
    allowed: counters.allowed,
    warned: counters.warned,
    blocked: counters.blocked,
    bySeverity: { ...counters.bySeverity },
    byCategory: { ...counters.byCategory },
    lastDecisionAt: counters.lastDecisionAt,
    lastReasonCode: counters.lastReasonCode,
  };
}

/** Resets counters. Use in tests only — not callable from renderer. */
export function _resetAuditCounters_TEST_ONLY(): void {
  counters.allowed = 0;
  counters.warned = 0;
  counters.blocked = 0;
  for (const k of Object.keys(counters.bySeverity)) {
    counters.bySeverity[k as SafetyGuardSeverity] = 0;
  }
  for (const k of Object.keys(counters.byCategory)) {
    delete counters.byCategory[k as SafetyGuardCategory];
  }
  counters.lastDecisionAt = null;
  counters.lastReasonCode = null;
}
