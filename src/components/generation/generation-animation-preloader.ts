import { animationAssets } from "./generation-animation-registry";

let preloadStarted = false;

export function preloadGenerationAnimations(): Promise<{
  loaded: string[];
  failed: string[];
}> {
  return new Promise((resolve) => {
    const loaded: string[] = [];
    const failed: string[] = [];
    const keys = Object.keys(animationAssets) as (keyof typeof animationAssets)[];
    let completed = 0;

    if (keys.length === 0) {
      resolve({ loaded, failed });
      return;
    }

    keys.forEach((key) => {
      const asset = animationAssets[key];
      const img = new Image();
      img.onload = () => {
        loaded.push(asset.id);
        checkDone();
      };
      img.onerror = () => {
        failed.push(asset.id);
        console.warn(`[GenerationPreloader] Failed to load asset: ${asset.id}`);
        checkDone();
      };
      img.src = asset.src;
    });

    function checkDone() {
      completed++;
      if (completed === keys.length) {
        resolve({ loaded, failed });
      }
    }
  });
}

export function initPreload() {
  if (preloadStarted) return;
  preloadStarted = true;
  if (typeof window !== "undefined") {
    setTimeout(() => {
      preloadGenerationAnimations().catch(() => {});
    }, 2000);
  }
}
