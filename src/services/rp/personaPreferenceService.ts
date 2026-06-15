/** @fileoverview Persists user preferences for Personas. */

const STORAGE_KEY = "venice_active_persona_id";

export async function getActivePersonaId(): Promise<string | null> {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(STORAGE_KEY) /* localStorage-allowed: active persona tracking */ : null;
  } catch {
    return null;
  }
}

export async function setActivePersonaId(id: string | null): Promise<void> {
  try {
    if (id) {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(STORAGE_KEY, id) /* localStorage-allowed: active persona tracking */;
    } else {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(STORAGE_KEY) /* localStorage-allowed: active persona tracking */;
    }
  } catch {
    // Ignore storage errors.
  }
}
