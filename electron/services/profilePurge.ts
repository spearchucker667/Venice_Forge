import { PROVIDER_REGISTRY } from "../../src/types/provider";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";
import { purgeProfileConversationVault } from "./conversationVault";
import {
  clearProfilePassword,
  deleteApiKey,
  deleteJinaApiKey,
  deleteProviderApiKey,
  deleteProviderCredential,
} from "./secureStore";
import { purgeRpProfileDirs } from "./rpProfilePaths";
import { redactErrorMessage } from "../../src/shared/redaction";
import { purgeProfileChatHistory } from "./chatStorage";
import { purgeProfileTtsCache } from "./chatTtsBridge";

export interface MainProfilePurgeStep {
  ok: boolean;
  removed?: boolean | number;
  error?: string;
}

export interface MainProfilePurgeResult {
  ok: boolean;
  profileId: string;
  steps: {
    conversationVault: MainProfilePurgeStep;
    chatHistory: MainProfilePurgeStep;
    ttsCache: MainProfilePurgeStep;
    veniceApiKey: MainProfilePurgeStep;
    jinaApiKey: MainProfilePurgeStep;
    providerApiKeys: MainProfilePurgeStep;
    providerCredentials: MainProfilePurgeStep;
    rpLibraries: MainProfilePurgeStep;
    passwordVerifier: MainProfilePurgeStep;
  };
}

async function runStep(action: () => void | Promise<void | { removed: boolean; ok?: boolean; error?: string }>): Promise<MainProfilePurgeStep> {
  try {
    const result = await action();
    if (result && typeof result === "object" && "ok" in result && result.ok === false) {
      return { ok: false, error: result.error };
    }
    return { ok: true, ...(result && "removed" in result ? { removed: result.removed } : {}) };
  } catch (error) {
    return { ok: false, error: redactErrorMessage(error) };
  }
}

/** Main-authoritative, idempotent purge for one non-default profile. */
export async function purgeMainProfileData(profileId: string): Promise<MainProfilePurgeResult> {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  if (profileId === "default") throw new Error("The default profile cannot be purged.");

  const conversationVault = await runStep(() => purgeProfileConversationVault(profileId));
  const chatHistory = await runStep(() => purgeProfileChatHistory(profileId));
  const ttsCache = await runStep(() => purgeProfileTtsCache(profileId));
  const veniceApiKey = await runStep(() => deleteApiKey(profileId));
  const jinaApiKey = await runStep(() => deleteJinaApiKey(profileId));
  let providerCount = 0;
  const providerApiKeys = await runStep(() => {
    for (const providerId of Object.keys(PROVIDER_REGISTRY)) {
      deleteProviderApiKey(providerId, profileId);
      providerCount += 1;
    }
  });
  if (providerApiKeys.ok) providerApiKeys.removed = providerCount;
  let credentialCount = 0;
  const providerCredentials = await runStep(() => {
    for (const providerId of Object.keys(PROVIDER_REGISTRY)) {
      deleteProviderCredential(providerId, profileId);
      credentialCount += 1;
    }
  });
  if (providerCredentials.ok) providerCredentials.removed = credentialCount;
  const rpLibraries = await runStep(() => purgeRpProfileDirs(profileId));
  const passwordVerifier = await runStep(() => clearProfilePassword(profileId));
  const steps = {
    conversationVault,
    chatHistory,
    ttsCache,
    veniceApiKey,
    jinaApiKey,
    providerApiKeys,
    providerCredentials,
    rpLibraries,
    passwordVerifier,
  };
  return { ok: Object.values(steps).every((step) => step.ok), profileId, steps };
}
