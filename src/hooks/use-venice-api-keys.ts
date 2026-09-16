import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { veniceFetch } from "../services/veniceClient/fetch";
import { VENICE_API_KEY_ID_PATTERN } from "../shared/validation";
import type {
  VeniceApiKeyCreateInput,
  VeniceApiKeyCreated,
  VeniceApiKeyDeleteResult,
  VeniceApiKeyListItem,
  VeniceApiKeyRateLimitLogEntry,
  VeniceApiKeyRateLimits,
  VeniceApiKeyUpdateInput,
  VeniceApiKeyUpdated,
} from "../types/venice-api-keys";
import { selectHasVeniceKey, useAuthStore } from "../stores/auth-store";
import { useProfileStore } from "../stores/profile-store";

/** Venice API-key administration (Phase 9). All calls flow through the
 *  canonical veniceFetch transport, which enforces the endpoint allowlist in
 *  the main process; the renderer only ever addresses the exact allowlisted
 *  routes (`/api_keys`, `/api_keys/{id}`, `/api_keys/rate_limits`,
 *  `/api_keys/rate_limits/log`) — never a generic URL/path passthrough.
 *
 *  SECURITY: list/get/update/delete responses never contain key material.
 *  The single exception is the one-time `apiKey` secret in the create
 *  response, which the caller must surface once and discard; veniceFetch's
 *  inspector telemetry redacts `apiKey`-named fields, so the secret never
 *  reaches logs or exports. */

const QUERY_TIMEOUT_MS = 30_000;
const LIST_STALE_MS = 30_000;
const RATE_LIMITS_STALE_MS = 60_000;
const LOG_STALE_MS = 60_000;

export interface UseVeniceApiKeysOptions {
  enabled?: boolean;
}

function listQueryKey(activeProfileId: string) {
  return ["venice-api-keys", "list", activeProfileId] as const;
}

/** Builds the exact allowlisted single-key path for a validated key id. */
function apiKeyPath(id: string): string {
  if (!VENICE_API_KEY_ID_PATTERN.test(id)) {
    throw new Error("Invalid Venice API key id.");
  }
  return `/api_keys/${encodeURIComponent(id)}`;
}

export function useVeniceApiKeys(options: UseVeniceApiKeysOptions = {}) {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  return useQuery({
    queryKey: listQueryKey(activeProfileId),
    queryFn: async () => {
      const res = await veniceFetch<{ data: VeniceApiKeyListItem[]; object: "list" }>(
        "/api_keys",
        { method: "GET", retry: false, timeoutMs: QUERY_TIMEOUT_MS },
      );
      return res.data.data;
    },
    enabled: (options.enabled ?? true) && hasVeniceKey,
    staleTime: LIST_STALE_MS,
    retry: false,
  });
}

/** Creates a key. The returned `VeniceApiKeyCreated.apiKey` is one-time secret
 *  material: render it exactly once and keep it out of persistent state. */
export function useCreateVeniceApiKey() {
  const queryClient = useQueryClient();
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  return useMutation({
    mutationFn: async (input: VeniceApiKeyCreateInput) => {
      const res = await veniceFetch<{ data: VeniceApiKeyCreated; success: boolean }>(
        "/api_keys",
        { method: "POST", body: input, retry: false, timeoutMs: QUERY_TIMEOUT_MS },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listQueryKey(activeProfileId) });
    },
  });
}

/** Updates only the fields upstream documents as mutable for a key. */
export function useUpdateVeniceApiKey() {
  const queryClient = useQueryClient();
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  return useMutation({
    mutationFn: async ({ id, ...input }: VeniceApiKeyUpdateInput & { id: string }) => {
      const res = await veniceFetch<{ data: VeniceApiKeyUpdated; success: boolean }>(
        apiKeyPath(id),
        { method: "PUT", body: input, retry: false, timeoutMs: QUERY_TIMEOUT_MS },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listQueryKey(activeProfileId) });
    },
  });
}

/** Permanently revokes a key. Callers must obtain explicit confirmation first. */
export function useDeleteVeniceApiKey() {
  const queryClient = useQueryClient();
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await veniceFetch<VeniceApiKeyDeleteResult>(apiKeyPath(id), {
        method: "DELETE",
        retry: false,
        timeoutMs: QUERY_TIMEOUT_MS,
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listQueryKey(activeProfileId) });
    },
  });
}

export function useVeniceApiKeyRateLimits(options: UseVeniceApiKeysOptions = {}) {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  return useQuery({
    queryKey: ["venice-api-keys", "rate-limits", activeProfileId],
    queryFn: async () => {
      const res = await veniceFetch<{ data: VeniceApiKeyRateLimits }>("/api_keys/rate_limits", {
        method: "GET",
        retry: false,
        timeoutMs: QUERY_TIMEOUT_MS,
      });
      return res.data.data;
    },
    enabled: (options.enabled ?? true) && hasVeniceKey,
    staleTime: RATE_LIMITS_STALE_MS,
    retry: false,
  });
}

export function useVeniceApiKeyRateLimitLog(options: UseVeniceApiKeysOptions = {}) {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  return useQuery({
    queryKey: ["venice-api-keys", "rate-limit-log", activeProfileId],
    queryFn: async () => {
      const res = await veniceFetch<{ data: VeniceApiKeyRateLimitLogEntry[]; object: "list" }>(
        "/api_keys/rate_limits/log",
        { method: "GET", retry: false, timeoutMs: QUERY_TIMEOUT_MS },
      );
      return res.data.data;
    },
    enabled: (options.enabled ?? true) && hasVeniceKey,
    staleTime: LOG_STALE_MS,
    retry: false,
  });
}
