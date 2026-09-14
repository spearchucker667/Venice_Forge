import { useQuery } from "@tanstack/react-query";
import { veniceFetch } from "../services/veniceClient/fetch";
import { buildCanonicalVideoQuotePayload } from "../shared/venice-media-contract/payload-builders";
import { normalizeVideoQuoteResponse } from "../shared/venice-media-contract/response-normalizers";
import { selectHasVeniceKey, useAuthStore } from "../stores/auth-store";

export interface UseVideoQuoteOptions {
  model?: string;
  duration?: string;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
  enabled?: boolean;
}

export function useVideoQuote(options: UseVideoQuoteOptions) {
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  const isEnabled = Boolean(
    (options.enabled ?? true) &&
      hasVeniceKey &&
      options.model?.trim() &&
      options.duration?.trim(),
  );

  return useQuery({
    queryKey: [
      "video-quote",
      options.model,
      options.duration,
      options.resolution,
      options.aspectRatio,
      options.audio,
    ],
    queryFn: async () => {
      if (!options.model || !options.duration) return null;
      try {
        const payload = buildCanonicalVideoQuotePayload({
          model: options.model,
          duration: options.duration,
          resolution: options.resolution || undefined,
          aspectRatio: options.aspectRatio || undefined,
          audio: options.audio !== undefined ? options.audio : undefined,
        });
        const res = await veniceFetch<unknown>("/video/quote", {
          method: "POST",
          body: payload,
          timeoutMs: 15_000,
          retry: false,
        });
        return normalizeVideoQuoteResponse(res.data);
      } catch {
        // Dynamic quote failure is non-fatal; graceful fallback
        return null;
      }
    },
    enabled: isEnabled,
    staleTime: 60_000,
  });
}
