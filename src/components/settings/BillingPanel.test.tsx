import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../stores/auth-store";

const veniceFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../services/veniceClient/fetch", () => ({
  veniceFetch: veniceFetchMock,
}));

import { BillingPanel } from "./BillingPanel";

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BillingPanel />
    </QueryClientProvider>,
  );
}

const BALANCE = {
  canConsume: true,
  consumptionCurrency: "DIEM",
  balances: { diem: 90.5, usd: 25 },
  diemEpochAllocation: 100,
};

const HISTORY_PAGE = {
  data: [
    {
      amount: -0.06356,
      currency: "DIEM",
      inferenceDetails: {
        completionTokens: 227,
        inferenceExecutionTime: 2964,
        promptTokens: 339,
        requestId: "chatcmpl-abc123",
      },
      notes: "API Inference",
      pricePerUnitUsd: 2.8,
      sku: "zai-org-glm-5-1-llm-output-mtoken",
      timestamp: "2026-06-15T19:05:10.504Z",
      units: 0.000227,
    },
  ],
  nextCursor: null,
};

const ANALYTICS = {
  lookback: "7d",
  byDate: [{ date: "2026-06-15", USD: 0.5, DIEM: 10.25 }],
  byModel: [
    {
      modelName: "GLM 5.1",
      unitType: "tokens",
      modelType: "LLM",
      totalUsd: 0.4,
      totalDiem: 12.5,
      totalUnits: 50000,
    },
  ],
  byModelDaily: [],
  topModels: ["GLM 5.1"],
  byKey: [
    {
      apiKeyId: "key_abc123",
      description: "Production Key",
      totalUsd: 0.8,
      totalDiem: 15,
      totalUnits: 75000,
    },
  ],
  byKeyDaily: [],
  topKeyNames: ["Production Key"],
};

function mockEndpointResponses(overrides: Record<string, unknown> = {}) {
  veniceFetchMock.mockImplementation((endpoint: string) => {
    if (typeof endpoint === "string" && endpoint.startsWith("/billing/balance")) {
      return Promise.resolve({ data: overrides.balance ?? BALANCE });
    }
    if (typeof endpoint === "string" && endpoint.startsWith("/billing/usage-history")) {
      return Promise.resolve({ data: overrides.history ?? HISTORY_PAGE });
    }
    if (typeof endpoint === "string" && endpoint.startsWith("/billing/usage-analytics")) {
      return Promise.resolve({ data: overrides.analytics ?? ANALYTICS });
    }
    return Promise.reject(new Error(`Unexpected endpoint: ${String(endpoint)}`));
  });
}

describe("BillingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ isConfigured: true, apiKey: "vn-test-key" });
  });

  it("shows a setup hint and fetches nothing when no Venice key is configured", () => {
    useAuthStore.setState({ isConfigured: false, apiKey: null });
    renderPanel();
    expect(screen.getByText("Add a Venice API key in the Venice API Key section to view balance and usage.")).toBeTruthy();
    expect(veniceFetchMock).not.toHaveBeenCalled();
  });

  it("renders the account balance card from /billing/balance", async () => {
    mockEndpointResponses();
    renderPanel();
    expect(screen.getByText("Account Balance")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("90.5")).toBeTruthy());
    expect(screen.getByText("$25")).toBeTruthy();
    expect(screen.getByText("Can make API requests")).toBeTruthy();
    expect(screen.getByText("Consumption currency: DIEM")).toBeTruthy();
  });

  it("renders usage history from /billing/usage-history and never calls deprecated /billing/usage", async () => {
    mockEndpointResponses();
    renderPanel();
    await waitFor(() => expect(screen.getByText("zai-org-glm-5-1-llm-output-mtoken")).toBeTruthy());
    expect(screen.getByText("chatcmpl-abc123")).toBeTruthy();
    const calledEndpoints = veniceFetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledEndpoints.some((e) => e.startsWith("/billing/usage-history"))).toBe(true);
    // The deprecated route is never used: every /billing/usage* call is the canonical history route.
    expect(calledEndpoints.every((e) => !e.startsWith("/billing/usage?") && e !== "/billing/usage")).toBe(true);
  });

  it("sends ISO timestamp bounds derived from the date filters", async () => {
    mockEndpointResponses();
    renderPanel();
    const startInput = await screen.findByLabelText("Start date");
    const endInput = await screen.findByLabelText("End date");
    fireEvent.change(startInput, { target: { value: "2026-06-01" } });
    fireEvent.change(endInput, { target: { value: "2026-06-15" } });

    await waitFor(() => {
      const historyCall = veniceFetchMock.mock.calls.find((call) => {
        const endpoint = String(call[0]);
        return (
          endpoint.startsWith("/billing/usage-history?") &&
          endpoint.includes("startTimestamp=2026-06-01T00%3A00%3A00Z") &&
          endpoint.includes("endTimestamp=2026-06-16T00%3A00%3A00Z")
        );
      });
      expect(historyCall).toBeDefined();
    });
  });

  it("walks additional history pages with the cursor alone (no filters)", async () => {
    const firstPage = { data: [...HISTORY_PAGE.data], nextCursor: "cursor-page-2" };
    const secondPage = {
      data: [
        {
          amount: -0.1,
          currency: "DIEM",
          inferenceDetails: null,
          notes: "API Inference",
          pricePerUnitUsd: 0.1,
          sku: "grok-imagine-image-image-unit",
          timestamp: "2026-06-14T19:52:45.087Z",
          units: 1,
        },
      ],
      nextCursor: null,
    };
    veniceFetchMock.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith("/billing/balance")) return Promise.resolve({ data: BALANCE });
      if (endpoint.startsWith("/billing/usage-analytics")) return Promise.resolve({ data: ANALYTICS });
      if (endpoint.startsWith("/billing/usage-history") && endpoint.includes("cursor=cursor-page-2")) {
        return Promise.resolve({ data: secondPage });
      }
      if (endpoint.startsWith("/billing/usage-history")) return Promise.resolve({ data: firstPage });
      return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
    });

    renderPanel();
    const loadMore = await screen.findByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);

    await waitFor(() => expect(screen.getByText("grok-imagine-image-image-unit")).toBeTruthy());
    const cursorCall = veniceFetchMock.mock.calls.find(
      (call) => String(call[0]).startsWith("/billing/usage-history") && String(call[0]).includes("cursor="),
    );
    expect(cursorCall).toBeDefined();
    const cursorEndpoint = String(cursorCall![0]);
    expect(cursorEndpoint).not.toContain("startTimestamp");
    expect(cursorEndpoint).not.toContain("currency");
  });

  it("shows the empty state when no usage is recorded", async () => {
    mockEndpointResponses({ history: { data: [], nextCursor: null } });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText("No usage recorded for the selected period.")).toBeTruthy(),
    );
  });

  it("points to API key settings on a 401 balance failure", async () => {
    veniceFetchMock.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith("/billing/balance")) {
        const err = new Error("unauthorized") as Error & { status: number };
        err.status = 401;
        return Promise.reject(err);
      }
      if (endpoint.startsWith("/billing/usage-history")) return Promise.resolve({ data: HISTORY_PAGE });
      if (endpoint.startsWith("/billing/usage-analytics")) return Promise.resolve({ data: ANALYTICS });
      return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
    });
    renderPanel();
    await waitFor(() =>
      expect(
        screen.getByText("Venice rejected the request (401). Check that your Venice API key in the Venice API Key section is valid."),
      ).toBeTruthy(),
    );
  });

  it("renders per-model and per-key analytics", async () => {
    mockEndpointResponses();
    renderPanel();
    await waitFor(() => expect(screen.getByText("GLM 5.1")).toBeTruthy());
    expect(screen.getByText("Production Key")).toBeTruthy();
    expect(screen.getByText("By model")).toBeTruthy();
    expect(screen.getByText("By API key")).toBeTruthy();
  });
});
