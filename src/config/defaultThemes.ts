// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Built-in theme names and discovery helpers used by the
 *  config system. The actual full theme data is owned by src/theme/themes.ts
 *  and exposed via `BUILTIN_THEMES`. This file is a thin, config-friendly
 *  index that does not require importing the heavy theme runtime. */
import { BUILTIN_THEMES } from "../theme/themes";

/** Built-in theme identifiers. Used as a fallback when a YAML-defined
 *  active theme cannot be resolved. */
export const BUILTIN_THEME_IDS: readonly string[] = BUILTIN_THEMES.map((t) => t.id);

/** Default theme id used when nothing else is configured. */
export const DEFAULT_THEME_ID: string = BUILTIN_THEMES[0]?.id ?? "builtin-dark";
