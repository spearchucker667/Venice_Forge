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
import { useProfileStore } from "../stores/profile-store";
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
    useSettingsStore.setState({ enabledProviders: { zebra: true, alpha: true, disabled: false }, primaryApiRoute: "venice" });
    useProfileStore.setState({ activeProfileId: "default" });
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

    // Profile id + primaryApiRoute are appended to the queryKey so a
    // /models payload observed under credential/profile A and a given
    // primary route cannot be reused as authoritative state for another
    // profile or another route. See §6.2 of the 2026-09-16 Venice API
    // feature-gap handoff and FRATERNA primary routing.
    expect(client.getQueryCache().getAll()[0].queryKey).toEqual(["models", "text", "alpha,zebra", "default", "venice"]);
    expect(result.current.data?.map((model) => model.id)).toEqual(["fallback-model", "live"]);
    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      status: "ready",
      source: "live",
      totalCount: 1,
      countsByType: { text: 1 },
      liveModelIds: ["live"],
      loadedTypes: ["text"],
      modelsByType: { text: ["live"] },
    });
  });

  it("invalidates the cached catalog when the active profile id changes", async () => {
    veniceMock.mockResolvedValue({
      object: "list",
      data: [{ id: "profile-a-live", object: "model", created: 0, owned_by: "venice" }],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderHook(() => useModels("text"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll()[0].queryKey).toEqual(["models", "text", "alpha,zebra", "default", "venice"]);
    expect(client.getQueryCache().getAll()[0].state.data).toBeDefined();

    // Switch profile — the cache must drop the previous result so a fresh
    // /models call is made under the new credential profile.
    useProfileStore.setState({ activeProfileId: "work-profile" });
    veniceMock.mockResolvedValue({
      object: "list",
      data: [{ id: "profile-b-live", object: "model", created: 0, owned_by: "venice" }],
    });
    const second = renderHook(() => useModels("text"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(["models", "text", "alpha,zebra", "default", "venice"]);
    expect(keys).toContainEqual(["models", "text", "alpha,zebra", "work-profile", "venice"]);
    expect(veniceMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates the cached catalog when the primaryApiRoute changes", async () => {
    veniceMock.mockResolvedValue({
      object: "list",
      data: [{ id: "venice-route-live", object: "model", created: 0, owned_by: "venice" }],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderHook(() => useModels("text"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll()[0].queryKey).toEqual(["models", "text", "alpha,zebra", "default", "venice"]);

    // Switch primary route — the cache must drop the previous result so a
    // fresh /models call is made under the new canonical host.
    useSettingsStore.setState({ primaryApiRoute: "fraterna" });
    veniceMock.mockResolvedValue({
      object: "list",
      data: [{ id: "fraterna-route-live", object: "model", created: 0, owned_by: "venice" }],
    });
    const second = renderHook(() => useModels("text"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(["models", "text", "alpha,zebra", "default", "venice"]);
    expect(keys).toContainEqual(["models", "text", "alpha,zebra", "default", "fraterna"]);
    expect(veniceMock).toHaveBeenCalledTimes(2);
  });

  // Spec §10 — on primary route change, the model-catalog runtime store
  // must be reset so the previous host's status / totalCount /
  // liveModelIds do not surface as authoritative state for the new host
  // while the refetch is in flight.
  it("resets the modelCatalogRuntimeStore when the primaryApiRoute changes", async () => {
    veniceMock.mockResolvedValue({
      object: "list",
      data: [{ id: "venice-route-live", object: "model", created: 0, owned_by: "venice" }],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderHook(() => useModels("text"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    // The Venice-routed query populated the runtime store.
    expect(useModelCatalogRuntimeStore.getState().liveModelIds).toEqual([
      "venice-route-live",
    ]);

    // Switch primary route → the runtime store must be repopulated by the
    // Fraterna fetch, not preserved from the Venice fetch. We verify by
    // asserting the eventual liveModelIds reflect the NEW mock.
    veniceMock.mockResolvedValue({
      object: "list",
      data: [{ id: "fraterna-route-live", object: "model", created: 0, owned_by: "venice" }],
    });
    useSettingsStore.setState({ primaryApiRoute: "fraterna" });
    // Trigger the reset hook synchronously by re-rendering.
    first.rerender();
    // The Fraterna refetch eventually repopulates the store with the new
    // mock's data — never the cached Venice response.
    await waitFor(() =>
      expect(useModelCatalogRuntimeStore.getState().liveModelIds).toEqual([
        "fraterna-route-live",
      ]),
    );
    // And the previous Venice model id is no longer present.
    expect(useModelCatalogRuntimeStore.getState().liveModelIds).not.toContain(
      "venice-route-live",
    );
  });

  it("preserves typed catalog metadata across modality loads", async () => {
    veniceMock
      .mockResolvedValueOnce({ object: "list", data: [{ id: "text-live", object: "model", created: 0, owned_by: "venice" }] })
      .mockResolvedValueOnce({ object: "list", data: [{ id: "image-live", object: "model", created: 0, owned_by: "venice" }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const textQuery = renderHook(() => useModels("text"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(textQuery.result.current.isSuccess).toBe(true));
    const imageQuery = renderHook(() => useModels("image"), { wrapper: createWrapper(client) });
    await waitFor(() => expect(imageQuery.result.current.isSuccess).toBe(true));

    expect(useModelCatalogRuntimeStore.getState()).toMatchObject({
      loadedTypes: ["text", "image"],
      modelsByType: { text: ["text-live"], image: ["image-live"] },
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
