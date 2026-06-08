/**
 * @fileoverview Renderer-side scenario service (Phase 2F RP Studio Polish).
 *
 * Two backends:
 *   - Electron: `window.veniceForge.scenarios.{list,get,save,delete}`
 *     (file-backed via the main-process single-file store)
 *   - Web: IndexedDB store `rpScenarios` (encrypted)
 *
 * **Safety:** `saveScenario` calls `assessScenario` so the scenario's
 * name/description/content are gated by the existing child-exploitation
 * guard before persistence. Blocked saves reject with a
 * `SafetyGuardBlockedError`.
 */

import { isElectron, desktopScenarios } from "../desktopBridge";
import type { ScenarioV1 } from "../../types/rp";
import {
  CARD_FIELD_MAX,
  MAX_LIST_SCENARIOS,
  RP_SCENARIO_VERSION,
  isValidRpId,
  normalizeScenario,
} from "../../types/rp";
import { assessScenario } from "../../shared/safety/characterImportSafety";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";
import { getEffectiveRendererLocalFamilySafeModeEnabled } from "../../safetyHydration";

const STORE = "rpScenarios" as const;
const ID_RE = isValidRpId;

/** Lists all scenarios (sorted by updatedAt desc, capped). */
export async function listScenarios(): Promise<ScenarioV1[]> {
  if (isElectron()) {
    const res = await desktopScenarios.list();
    if (!res.ok) throw new Error(res.error ?? "Failed to list scenarios.");
    return (res.scenarios ?? [])
      .map(normalizeScenario)
      .filter((s): s is ScenarioV1 => s !== null)
      .slice(0, MAX_LIST_SCENARIOS);
  }
  const records = await StorageService.getItems<ScenarioV1>(STORE);
  return records
    .map(normalizeScenario)
    .filter((s): s is ScenarioV1 => s !== null)
    .slice(0, MAX_LIST_SCENARIOS);
}

/** Reads a single scenario by id, or returns null. */
export async function readScenario(id: string): Promise<ScenarioV1 | null> {
  if (!ID_RE(id)) return null;
  if (isElectron()) {
    const res = await desktopScenarios.get(id);
    if (!res.ok) return null;
    return res.scenario ? normalizeScenario(res.scenario) : null;
  }
  const record = await StorageService.getItem<ScenarioV1>(STORE, id);
  return record ? normalizeScenario(record) : null;
}

/** Saves a scenario atomically. Generates an id if missing. */
export async function saveScenario(scenario: ScenarioV1): Promise<ScenarioV1> {
  const now = Date.now();
  const id = scenario.id && ID_RE(scenario.id) ? scenario.id : generateId();
  const next: ScenarioV1 = {
    ...scenario,
    id,
    schema: "ScenarioV1",
    createdAt: scenario.createdAt ?? now,
    updatedAt: now,
  };
  const normalized = normalizeScenario(next);
  if (!normalized) throw new Error("Invalid scenario.");
  // Safety: gate the save with the existing scenario safety heuristic.
  const safety = assessScenario(normalized, getEffectiveRendererLocalFamilySafeModeEnabled());
  if (!safety.allow || safety.action === "block") {
    throw new SafetyGuardBlockedError(safety);
  }
  if (isElectron()) {
    const res = await desktopScenarios.save(normalized);
    if (!res.ok) throw new Error(res.error ?? "Failed to save scenario.");
    return res.scenario ? normalizeScenario(res.scenario) ?? normalized : normalized;
  }
  await StorageService.saveItem(STORE, normalized as unknown as Record<string, unknown>);
  return normalized;
}

/** Deletes a scenario by id. Returns true when removed. */
export async function deleteScenario(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopScenarios.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/** Generates a new id that satisfies `VALID_ID_RE`. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Schema version helper. */
export const scenarioSchemaVersion = RP_SCENARIO_VERSION;

/** Re-export CARD_FIELD_MAX for downstream consumers. */
export { CARD_FIELD_MAX };
