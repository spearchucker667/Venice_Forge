import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../stores/auth-store";

const veniceFetchMock = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("../../services/veniceClient/fetch", () => ({
  veniceFetch: veniceFetchMock,
}));
vi.mock("../../stores/toast-store", () => ({
  toast: { success: toastSuccess, error: toastError, info: vi.fn(), fromError: vi.fn() },
}));

import { VeniceApiKeysPanel } from "./VeniceApiKeysPanel";
import type { VeniceApiKeyListItem } from "../../types/venice-api-keys";

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <VeniceApiKeysPanel />
    </QueryClientProvider>,
  );
}

const LIST_KEY: VeniceApiKeyListItem = {
  apiKeyType: "ADMIN",
  consumptionLimits: { usd: 50, diem: 10, vcu: null },
  limitPeriod: "MONTH",
  modelPrivacy: "ALL",
  createdAt: "2026-09-01T12:00:00Z",
  description: "Production Key",
  expiresAt: null,
  id: "e28e82dc-9df2-4b47-b726-d0a222ef2ab5",
  last6Chars: "2V2jNW",
  lastUsedAt: "2026-09-10T08:30:00Z",
  usage: { trailingSevenDays: { usd: "10.2424", vcu: "42.2315", diem: "4.2231" } },
  currentPeriodUsage: { usd: "5.1234", diem: "2.5000" },
};

const RATE_LIMITS = {
  accessPermitted: true,
  apiTier: { id: "paid", isCharged: true },
  balances: { USD: 50.23, DIEM: 100.023 },
  keyExpiration: null,
  nextEpochBegins: "2026-09-17T00:00:00.000Z",
  rateLimits: [
    { apiModelId: "zai-org-glm-5-1", rateLimits: [{ amount: 100, type: "RPM" }, { amount: 500000, type: "TPM" }] },
  ],
};

const RATE_LIMIT_LOG = [
  {
    apiKeyId: "e28e82dc-9df2-4b47-b726-d0a222ef2ab5",
    modelId: "zai-org-glm-5-1",
    rateLimitTier: "paid",
    rateLimitType: "RPM",
    timestamp: "2026-09-12T10:00:00Z",
  },
];

function mockDefaultResponses(overrides: { list?: unknown; listError?: { status: number; message: string } } = {}) {
  veniceFetchMock.mockImplementation((endpoint: string, options?: { method?: string; body?: unknown }) => {
    if (endpoint === "/api_keys" && (options?.method ?? "GET") === "GET") {
      if (overrides.listError) {
        const err = new Error(overrides.listError.message) as Error & { status: number };
        err.status = overrides.listError.status;
        return Promise.reject(err);
      }
      return Promise.resolve({ data: { data: overrides.list ?? [LIST_KEY], object: "list" } });
    }
    if (endpoint === "/api_keys" && options?.method === "POST") {
      const body = options.body as { description?: string };
      return Promise.resolve({
        data: {
          data: {
            apiKey: "vn-created-secret-one-time",
            apiKeyType: "INFERENCE",
            consumptionLimit: { usd: null, diem: null, vcu: null },
            limitPeriod: "EPOCH",
            modelPrivacy: "ALL",
            description: body?.description ?? "",
            expiresAt: null,
            id: "new-key-id",
          },
          success: true,
        },
      });
    }
    if (endpoint.startsWith("/api_keys/") && options?.method === "PUT") {
      return Promise.resolve({ data: { data: { ...LIST_KEY, ...((options.body ?? {}) as object) }, success: true } });
    }
    if (endpoint.startsWith("/api_keys/") && options?.method === "DELETE") {
      return Promise.resolve({ data: { success: true } });
    }
    if (endpoint === "/api_keys/rate_limits") {
      return Promise.resolve({ data: { data: RATE_LIMITS } });
    }
    if (endpoint === "/api_keys/rate_limits/log") {
      return Promise.resolve({ data: { data: RATE_LIMIT_LOG, object: "list" } });
    }
    return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
  });
}

describe("VeniceApiKeysPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ isConfigured: true, apiKey: "vn-test-2V2jNW" });
  });

  it("prompts for key setup when no Venice key is configured", () => {
    useAuthStore.setState({ isConfigured: false, apiKey: null });
    renderPanel();
    expect(
      screen.getByText("Add your Venice API key in the Venice API Key section to manage account keys. Key administration requires an API key with account access."),
    ).toBeTruthy();
    expect(veniceFetchMock).not.toHaveBeenCalled();
  });

  it("lists keys with safe metadata only and flags the active key by suffix", async () => {
    mockDefaultResponses();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Production Key")).toBeTruthy());
    expect(screen.getByText("…2V2jNW")).toBeTruthy();
    expect(screen.getByText("ADMIN")).toBeTruthy();
    expect(screen.getByText("Active key")).toBeTruthy();
    expect(screen.getByText("50 USD / 10 DIEM per MONTH")).toBeTruthy();
    // No full key material anywhere in the list surface.
    expect(screen.queryByText("vn-test-2V2jNW")).toBeNull();
    expect(screen.queryByText("vn-created-secret-one-time")).toBeNull();
  });

  it("shows the admin-rights error when key administration is denied", async () => {
    mockDefaultResponses({ listError: { status: 403, message: "forbidden" } });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText("Venice denied key administration (403). The active API key may lack admin rights — check the key in the Venice API Key section.")).toBeTruthy(),
    );
  });

  it("creates a key and shows the one-time secret exactly once with a copy action", async () => {
    mockDefaultResponses();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderPanel();
    fireEvent.change(await screen.findByLabelText("Name (max 64 characters)"), {
      target: { value: "CI Runner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText("vn-created-secret-one-time")).toBeTruthy();
    expect(screen.getByText("API key (shown once)")).toBeTruthy();
    expect(veniceFetchMock).toHaveBeenCalledWith(
      "/api_keys",
      expect.objectContaining({ method: "POST", body: expect.objectContaining({ description: "CI Runner", apiKeyType: "INFERENCE" }) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("vn-created-secret-one-time"));

    // Closing discards the secret: reopening the list shows no secret material.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("vn-created-secret-one-time")).toBeNull());
  });

  it("updates a key through PUT /api_keys/{id} with only mutable fields", async () => {
    mockDefaultResponses();
    renderPanel();
    await screen.findByText("Production Key");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Both the create form and the expanded edit form carry a Name label;
    // the edit form is the last one in DOM order.
    const nameInputs = await screen.findAllByLabelText("Name (max 64 characters)");
    fireEvent.change(nameInputs[nameInputs.length - 1], { target: { value: "Renamed Key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(veniceFetchMock).toHaveBeenCalledWith(
        "/api_keys/e28e82dc-9df2-4b47-b726-d0a222ef2ab5",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({ description: "Renamed Key" }),
        }),
      ),
    );
    const putCall = veniceFetchMock.mock.calls.find((call) => call[1]?.method === "PUT");
    const putBody = putCall![1].body as Record<string, unknown>;
    expect(putBody).not.toHaveProperty("apiKeyType");
    expect(putBody).not.toHaveProperty("id");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("API key updated."));
  });

  it("revokes a key only after typing its name and never on a stray Enter press", async () => {
    mockDefaultResponses();
    renderPanel();
    await screen.findByText("Production Key");

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText("Revoke this API key?")).toBeTruthy();
    expect(screen.getByText("This appears to be the key Venice Forge is currently using. Deleting it will stop Venice requests until you add a new key.")).toBeTruthy();

    const confirmInput = screen.getByLabelText('Type "Production Key" to confirm.');
    const revokeButton = screen.getByRole("button", { name: "Revoke key" }) as HTMLButtonElement;
    expect(revokeButton.disabled).toBe(true);

    // A stray Enter inside the confirmation input must not submit.
    fireEvent.keyDown(confirmInput, { key: "Enter" });
    expect(veniceFetchMock.mock.calls.filter((call) => call[1]?.method === "DELETE")).toHaveLength(0);

    fireEvent.change(confirmInput, { target: { value: "Production Key" } });
    expect(revokeButton.disabled).toBe(false);
    fireEvent.click(revokeButton);

    await waitFor(() =>
      expect(veniceFetchMock).toHaveBeenCalledWith(
        "/api_keys/e28e82dc-9df2-4b47-b726-d0a222ef2ab5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("API key revoked."));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancelling the revoke dialog sends no delete request", async () => {
    mockDefaultResponses();
    renderPanel();
    await screen.findByText("Production Key");

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(veniceFetchMock.mock.calls.filter((call) => call[1]?.method === "DELETE")).toHaveLength(0);
  });

  it("renders rate-limit state and the recent rate-limit event log", async () => {
    mockDefaultResponses();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Inference access permitted")).toBeTruthy());
    expect(screen.getByText("Tier: paid (pay per use)")).toBeTruthy();
    expect(screen.getByText("Balance: 50.23 USD / 100.023 DIEM")).toBeTruthy();
    expect(screen.getByText("100 RPM · 500000 TPM")).toBeTruthy();
    expect(screen.getByText("Requests per minute limit")).toBeTruthy();
  });
});
