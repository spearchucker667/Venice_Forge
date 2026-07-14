import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function getPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(QUERY).matches === true;
}

export function syncPrefersReducedMotion(): boolean {
  const reduced = getPrefersReducedMotion();
  if (typeof document !== "undefined") {
    document.documentElement.dataset.reducedMotion = reduced ? "reduce" : "no-preference";
    document.documentElement.style.setProperty("--prefers-reduced-motion", reduced ? "reduce" : "no-preference");
  }
  return reduced;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => syncPrefersReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setReduced(false);
      return undefined;
    }
    const mql = window.matchMedia(QUERY);
    const handler = () => setReduced(syncPrefersReducedMotion());
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return reduced;
}
