// @vitest-environment node
/** @fileoverview Regression tests for the credential name reservation policy
 *  in `apiKeyHandlers.ts`.
 *
 *  The renderer-writable generic `credential:*` IPC bridge was removed.
 *  Internal application namespaces (e.g. chat-folder lock metadata) and
 *  password names must remain reserved if a generic store is reintroduced.
 */

import { describe, it, expect } from "vitest";
import { isReservedCredentialName } from "./apiKeyHandlers";

describe("isReservedCredentialName", () => {
  it("rejects empty and non-string names", () => {
    expect(isReservedCredentialName("")).toBe(true);
    expect(isReservedCredentialName(null)).toBe(true);
    expect(isReservedCredentialName(undefined)).toBe(true);
    expect(isReservedCredentialName(123)).toBe(true);
  });

  it("rejects password-related names", () => {
    expect(isReservedCredentialName("password")).toBe(true);
    expect(isReservedCredentialName("master_password")).toBe(true);
    expect(isReservedCredentialName("profile_password")).toBe(true);
    expect(isReservedCredentialName("profile_password:default")).toBe(true);
    expect(isReservedCredentialName("api_password")).toBe(true);
  });

  it("rejects unlock-secret-related names", () => {
    expect(isReservedCredentialName("unlock-secret")).toBe(true);
    expect(isReservedCredentialName("secret_unlock")).toBe(true);
  });

  it("rejects the chat-folder-lock internal namespace", () => {
    expect(isReservedCredentialName("chat-folder-lock:default:folder-1")).toBe(true);
    expect(isReservedCredentialName("chat-folder-lock:default:folder-1:device")).toBe(true);
    expect(isReservedCredentialName("CHAT-FOLDER-LOCK:default:folder-1")).toBe(true);
  });

  it("accepts ordinary provider/generic credential names", () => {
    expect(isReservedCredentialName("venice_api_key")).toBe(false);
    expect(isReservedCredentialName("openai_api_key")).toBe(false);
    expect(isReservedCredentialName("jina_api_key")).toBe(false);
    expect(isReservedCredentialName("custom_setting")).toBe(false);
  });
});
