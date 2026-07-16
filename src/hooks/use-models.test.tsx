import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const veniceMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/venice-client", () => ({ venice: veniceMock }));
vi.mock("../config/provider-models", () => ({
  getEnabledProviderModels: () => [{ id: "fallback-model", object: "model", created: 0, owned_by: "fallback" }],
}));

import { useModels } from "./use-models";
import { useSettingsStore } from "../stores/settings-store";
import { useModelCatalogRuntimeStore } from "../stores/model-catalog-runtime-store";

// VERIFY-138 regression guard: catalog health, auth hydration, query identity,
// and render/persistence containment must remain independent of selected models
// and raw provider-token frequency.

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useModels canonical catalog lifecycle", () => {
  beforeEach(() => {
    veniceMock.mockReset();
    useModelCatalogRuntimeStore.getState().reset();
    useSettingsStore.setState({ enabledProviders: { zebra: true, alpha: true, disabled: false } });
  });

  it("uses a deterministic primitive query key and counts only live Venice models", async () => {
    veniceMock.mockResolvedValue({
      object: "list",
      data: [
        { id: "live", object: "model", created: 0, owned_by: "venice" },
        { id: "offline", object: "model", created: 0, owned_by: "venice", model_spec: { offline: true } },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useModels("chat"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryCache().getAll()[0].queryKey).toEqual(["models", "text", "alpha,zebra"]);
    expect(result.current.data?.map((model) => model.id)).toEqual(["fallback-model", "live"]);
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      status: "ready",
      source: "live",
      totalCount: 1,
      countsByType: { text: 1 },
      liveModelIds: ["live"],
    });
  });

  it("publishes an empty successful response and disables hidden query work", async () => {
    veniceMock.mockResolvedValue({ object: "list", data: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useModels("text", { enabled: false }), { wrapper: createWrapper(client) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(veniceMock).not.toHaveBeenCalled();

    const enabled = renderHook(() => useModels("text"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true));
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({ status: "ready", totalCount: 0 });
  });

  it("publishes a redacted terminal failure when no cached catalog exists", async () => {
    veniceMock.mockRejectedValue(new Error("Bearer secret at /Users/private/catalog"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useModels(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const runtime = useModelCatalogRuntimeStore.getState();
    expect(runtime.status).toBe("error");
    expect(runtime.lastError).not.toMatch(/Bearer secret|\/Users\/private/);
  });
});
