// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Central Venice API configuration shared between renderer and main process.
 *
 * In Node contexts (Electron main, server) env vars override defaults.
 * In the sandboxed renderer, defaults are always used.
 */

import { AppConfig, parsePositiveInt } from "./configSchema";

export const VENICE_API_HOST = AppConfig.VENICE_API_HOST;
export const VENICE_API_BASE_PATH = AppConfig.VENICE_API_BASE_PATH;
export const VENICE_API_TIMEOUT_MS = AppConfig.VENICE_API_TIMEOUT_MS;
export const parsePositiveIntEnv = parsePositiveInt;

/** Base path for the local development proxy. */
export const PROXY_BASE_PATH = "/api/venice";
