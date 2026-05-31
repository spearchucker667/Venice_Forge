// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SearchScrapeModule } from "./SearchScrapeModule";
import { initialState } from "../state/appReducer";

vi.mock("../services/veniceClient", () => ({
  veniceFetch: vi.fn(),
}));

vi.mock("../research/agent/socialDiscovery", () => ({
  runSocialDiscovery: vi.fn(),
}));

import { veniceFetch } from "../services/veniceClient";
import { runSocialDiscovery } from "../research/agent/socialDiscovery";

describe("SearchScrapeModule", () => {
  const dispatch = vi.fn();
  type VeniceFetchResult = Awaited<ReturnType<typeof veniceFetch<Record<string, unknown>>>>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModule() {
    return render(<SearchScrapeModule state={initialState} dispatch={dispatch} />);
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function veniceResult(data: Record<string, unknown>): VeniceFetchResult {
    return {
      data,
      response: new Response(),
      headers: {},
      diagnostics: {},
    };
  }

  it("disables profile discovery run button until authorization is checked", async () => {
    renderModule();
    await userEvent.click(screen.getByRole("button", { name: /public profile discovery/i }));

    const runBtn = screen.getByRole("button", { name: /discover public profiles/i });
    expect(runBtn).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/example brand/i), "Test Name");
    const checkbox = screen.getByRole("checkbox", { name: /i confirm this search/i });
    await userEvent.click(checkbox);
    expect(runBtn).toBeEnabled();
  });

  it("shows a clear message for invalid search response shape", async () => {
    vi.mocked(veniceFetch).mockResolvedValueOnce({ data: { nope: true } } as any);
    renderModule();

    await userEvent.type(screen.getByPlaceholderText(/latest model routing/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/unexpected search response from server/i);
    });
  });

  it("blocks invalid scrape URL before API call", async () => {
    renderModule();
    await userEvent.type(screen.getByPlaceholderText("https://example.com"), "javascript:alert(1)");
    await userEvent.click(screen.getByRole("button", { name: /^scrape$/i }));

    expect(veniceFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a valid public http\(s\) url/i);
  });

  it("clears stale scrape output before a failed retry", async () => {
    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { markdown: "old text" } } as any)
      .mockRejectedValueOnce(new Error("Scrape failed"));
    renderModule();

    const urlInput = screen.getByPlaceholderText("https://example.com");
    const scrapeBtn = screen.getByRole("button", { name: /^scrape$/i });
    const output = screen.getByPlaceholderText(/scraped markdown\/text output/i) as HTMLTextAreaElement;

    await userEvent.type(urlInput, "https://example.com");
    await userEvent.click(scrapeBtn);
    await waitFor(() => expect(output.value).toBe("old text"));

    await userEvent.click(scrapeBtn);
    await waitFor(() => expect(output.value).toBe(""));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/scrape failed/i));
  });

  it("aborts a stale search request when a scrape run starts", async () => {
    const search = deferred<VeniceFetchResult>();
    const scrape = deferred<VeniceFetchResult>();
    let searchSignal: AbortSignal | undefined;

    vi.mocked(veniceFetch).mockImplementation((endpoint, options) => {
      if (endpoint === "/augment/search") {
        searchSignal = options?.signal;
        return search.promise;
      }
      if (endpoint === "/augment/scrape") {
        return scrape.promise;
      }
      throw new Error(`Unexpected endpoint ${endpoint}`);
    });

    renderModule();

    await userEvent.type(screen.getByPlaceholderText(/latest model routing/i), "first query");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(searchSignal?.aborted).toBe(false);

    await userEvent.type(screen.getByPlaceholderText("https://example.com"), "https://example.com");
    await userEvent.click(screen.getByRole("button", { name: /^scrape$/i }));
    expect(searchSignal?.aborted).toBe(true);

    await act(async () => {
      search.resolve(veniceResult({ results: [{ title: "stale result", url: "https://old.example" }] }));
      await Promise.resolve();
    });
    expect(screen.queryByText("stale result")).not.toBeInTheDocument();

    await act(async () => {
      scrape.resolve(veniceResult({ markdown: "fresh scrape" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/scraped markdown\/text output/i)).toHaveValue("fresh scrape");
    });
  });

  it("cancels profile discovery through the propagated abort signal", async () => {
    const discovery = deferred<Awaited<ReturnType<typeof runSocialDiscovery>>>();
    let discoverySignal: AbortSignal | undefined;
    vi.mocked(runSocialDiscovery).mockImplementation((input) => {
      discoverySignal = input.signal;
      return discovery.promise;
    });

    renderModule();
    await userEvent.click(screen.getByRole("button", { name: /public profile discovery/i }));
    await userEvent.type(screen.getByPlaceholderText(/example brand/i), "Test Name");
    await userEvent.click(screen.getByRole("checkbox", { name: /i confirm this search/i }));
    await userEvent.click(screen.getByRole("button", { name: /discover public profiles/i }));

    expect(discoverySignal?.aborted).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(discoverySignal?.aborted).toBe(true);

    await act(async () => {
      discovery.resolve({
        ok: true,
        candidates: [
          {
            platform: "GitHub",
            url: "https://github.com/stale",
            confidence: "high",
            confidenceScore: 1,
            matchedSignals: ["name"],
            evidenceUrls: ["https://github.com/stale"],
            checkedAt: "2026-05-31T00:00:00.000Z",
          },
        ],
        queriesUsed: [],
      });
      await Promise.resolve();
    });

    expect(screen.queryByText("https://github.com/stale")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discover public profiles/i })).toBeEnabled();
  });
});
