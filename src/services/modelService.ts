import { veniceFetch } from "./veniceClient";
import { flattenModels } from "../state/appReducer";

const CACHE_KEY = "venice-forge-models-cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ModelsCache {
  grouped: any;
  fetchedAt: number;
}

function readCache(): ModelsCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(grouped: any): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ grouped, fetchedAt: Date.now() }));
  } catch {
    // localStorage may be full or unavailable.
  }
}

export async function refreshModels(dispatch: any, force = false): Promise<void> {
  if (!force) {
    const cached = readCache();
    if (cached) {
      dispatch({ type: "SET_MODELS", models: cached.grouped, fallback: false });
      return;
    }
  }

  try {
    const { data } = await veniceFetch("/models?type=all", {
      method: "GET",
      dispatch,
      retry: true,
      dedupe: true,
    });
    const grouped = flattenModels(data);
    writeCache(grouped);
    dispatch({ type: "SET_MODELS", models: grouped, fallback: false });
  } catch (err: any) {
    dispatch({
      type: "SET_MODELS",
      models: undefined,
      fallback: true,
      error:
        err.message ||
        "Model discovery failed; using non-exhaustive static fallbacks.",
    });
  }
}
