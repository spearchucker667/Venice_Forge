import type { ThemeFamily } from './themeTypes';
import { BUILTIN_THEME_FAMILIES } from './builtins';

export interface ThemeRegistrySnapshot {
  builtIns: ThemeFamily[];
  custom: ThemeFamily[];
  yaml: ThemeFamily[];
}

export class ThemeRegistry {
  private builtIns: Map<string, ThemeFamily>;
  private custom: Map<string, ThemeFamily> = new Map();
  private yaml: Map<string, ThemeFamily> = new Map();

  constructor(builtIns: ThemeFamily[]) {
    this.builtIns = new Map(builtIns.map((f) => [f.id, f]));
  }

  private allMaps(): Map<string, ThemeFamily>[] {
    // Precedence: YAML overrides custom overrides built-in.
    return [this.yaml, this.custom, this.builtIns];
  }

  get(id: string | null | undefined): ThemeFamily | null {
    if (!id) return null;
    for (const map of this.allMaps()) {
      const found = map.get(id);
      if (found) return found;
    }
    // Alias resolution.
    for (const map of this.allMaps()) {
      for (const family of map.values()) {
        if (family.aliases?.includes(id)) return family;
      }
    }
    return null;
  }

  has(id: string): boolean {
    return this.get(id) !== null;
  }

  list(): ThemeFamily[] {
    const seen = new Set<string>();
    const out: ThemeFamily[] = [];
    for (const map of this.allMaps()) {
      for (const family of map.values()) {
        if (seen.has(family.id)) continue;
        seen.add(family.id);
        out.push(family);
      }
    }
    return out;
  }

  snapshot(): ThemeRegistrySnapshot {
    return {
      builtIns: [...this.builtIns.values()],
      custom: [...this.custom.values()],
      yaml: [...this.yaml.values()],
    };
  }

  registerCustom(family: ThemeFamily): void {
    this.custom.set(family.id, family);
  }

  registerCustomFamilies(families: ThemeFamily[]): void {
    for (const family of families) {
      this.custom.set(family.id, family);
    }
  }

  removeCustom(id: string): void {
    this.custom.delete(id);
  }

  registerYaml(family: ThemeFamily): void {
    this.yaml.set(family.id, family);
  }

  registerYamlFamilies(families: Record<string, ThemeFamily>): void {
    for (const family of Object.values(families)) {
      this.yaml.set(family.id, family);
    }
  }

  clearYaml(): void {
    this.yaml.clear();
  }

  isBuiltInId(id: string): boolean {
    // Fast path: exact built-in family id.
    if (this.builtIns.has(id)) return true;
    // Alias path: a built-in family may register aliases (e.g. "builtin-venice").
    for (const family of this.builtIns.values()) {
      if (family.aliases?.includes(id)) return true;
    }
    return false;
  }
}

export const themeRegistry = new ThemeRegistry(BUILTIN_THEME_FAMILIES);

export function getThemeFamily(id: string | null | undefined): ThemeFamily | null {
  return themeRegistry.get(id);
}

export function listThemeFamilies(): ThemeFamily[] {
  return themeRegistry.list();
}
