// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Built-in default config exported for both runtime and tests.
 *  Mirrors `.config/config.example.yaml` but is always available, even if the
 *  user's config files are missing or invalid. */
import { emptyConfig, type YamlConfig } from "./configSchema";

/** Returns a fresh deep clone of the built-in defaults. */
export function getDefaultConfig(): YamlConfig {
  return emptyConfig();
}
