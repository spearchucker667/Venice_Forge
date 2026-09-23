/** @fileoverview VF-20260923-P1-027 — StatusView safety runtime status tests.
 *  The four safety concepts render as separate rows sourced from the mocked
 *  live status payload; the surface re-fetches whenever the renderer-side
 *  safety toggles change. */

import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSafetyRuntimeStatus: vi.fn(),
  getDiagnostics: vi.fn(),
  openLogsFolder: vi.fn(),
}));

vi.mock("../services/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/desktopBridge")>();
  return {
    ...actual,
    isElectron: () => true,
    desktopApp: {
      ...actual.desktopApp,
      getDiagnostics: mocks.getDiagnostics,
      getSafetyRuntimeStatus: mocks.getSafetyRuntimeStatus,
      openLogsFolder: mocks.openLogsFolder,
    },
  };
});

import { StatusView } from "./StatusView";
import { useSettingsStore } from "../stores/settings-store";
import { _resetAuditCounters_TEST_ONLY } from "../shared/safety";
import type { SafetyRuntimeStatus } from "../shared/safety/safetyRuntimeStatus";

function makeStatus(overrides: Partial<SafetyRuntimeStatus> = {}): SafetyRuntimeStatus {
  return {
    localSafeguards: {
      enabled: true,
      source: "user",
      lastChangedAt: "2026-09-23T00:00:00.000Z",
    },
    providerSafety: { safeMode: true },
    structuralValidation: { active: true, requestsValidated: 7, rejectedRequests: 2 },
    semanticClassifiers: {
      backendRegistered: true,
      backendName: "nsfwjs-test",
      image: "available",
      audio: "unsupported",
      video: "unsupported",
    },
    counters: {
      textEvaluations: 1,
      imageEvaluations: 2,
      audioEvaluations: 3,
      videoEvaluations: 4,
      blocked: 5,
      allowed: 6,
      skippedDisabled: 7,
      errors: 8,
    },
    ...overrides,
  };
}

const DIAGNOSTICS = {
  isDesktop: true,
  appVersion: "3.0.0-test",
  electronVersion: "33.0.0",
  chromeVersion: "130.0.0",
  nodeVersion: "22.15.0",
  userDataPath: "VeniceForgeTest",
  logsPath: "logs",
  storageMode: "encrypted",
  secureStorageAvailable: true,
  apiKeyConfigured: true,
  transport: "direct-ipc",
  lastApiError: "",
};

/** Row labels are not globally unique (e.g. "Blocked" also appears in the
 *  audit section), so match the label span's sibling value instead of
 *  requiring a single getByText hit. */
function expectRow(label: string, value: string) {
  const found = screen
    .getAllByText(label)
    .some((el) => el.parentElement?.children[1]?.textContent === value);
  expect(found, `expected a "${label}" row with value "${value}"`).toBe(true);
}

beforeEach(() => {
  vi.restoreAllMocks();
  _resetAuditCounters_TEST_ONLY();
  mocks.getDiagnostics.mockReset();
  mocks.getDiagnostics.mockResolvedValue(DIAGNOSTICS);
  mocks.getSafetyRuntimeStatus.mockReset();
  mocks.getSafetyRuntimeStatus.mockResolvedValue(makeStatus());
  mocks.openLogsFolder.mockReset();
  useSettingsStore.setState({
    activeTab: "status",
    localFamilySafeModeEnabled: true,
    veniceApiSafeMode: true,
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StatusView safety runtime status (VF-20260923-P1-027)", () => {
  it("renders separate safety rows from the live status payload", async () => {
    render(<StatusView />);
    await waitFor(() => expect(mocks.getSafetyRuntimeStatus).toHaveBeenCalled());

    expect(screen.getByText("Safety runtime")).toBeInTheDocument();
    expect(screen.getByText("Structural / protocol validation")).toBeInTheDocument();
    expect(screen.getByText("Media classifier backend")).toBeInTheDocument();
    expect(screen.getByText("Classifier counters")).toBeInTheDocument();

    expectRow("Local content safeguards", "Enabled · source: user");
    expectRow("Provider safety (Venice safe_mode)", "On");
    expectRow("Requests validated", "7");
    expectRow("Rejected requests", "2");
    expectRow("Backend registered", "yes");
    expectRow("Backend name", "nsfwjs-test");
    expectRow("Image:", "Available");
    expectRow("Audio:", "Unsupported");
    expectRow("Video:", "Unsupported");
    expectRow("Text evaluations", "1");
    expectRow("Image evaluations", "2");
    expectRow("Audio evaluations", "3");
    expectRow("Video evaluations", "4");
    expectRow("Blocked", "5");
    expectRow("Allowed", "6");
    expectRow("Skipped (safeguards disabled)", "7");
    expectRow("Errors", "8");
  });

  it("renders Not configured per modality without a registered backend and never says unavailable", async () => {
    mocks.getSafetyRuntimeStatus.mockResolvedValue(
      makeStatus({
        semanticClassifiers: {
          backendRegistered: false,
          image: "not-configured",
          audio: "not-configured",
          video: "not-configured",
        },
      }),
    );
    render(<StatusView />);
    await waitFor(() => expectRow("Backend registered", "no"));
    expectRow("Image:", "Not configured");
    expectRow("Audio:", "Not configured");
    expectRow("Video:", "Not configured");
    expect(screen.queryByText(/unavailable/i)).toBeNull();
  });

  it("shows Disabled and the skippedDisabled counter when local safeguards are off", async () => {
    mocks.getSafetyRuntimeStatus.mockResolvedValue(
      makeStatus({
        localSafeguards: {
          enabled: false,
          source: "user",
          lastChangedAt: "2026-09-23T00:00:00.000Z",
        },
        counters: { ...makeStatus().counters, skippedDisabled: 4 },
      }),
    );
    render(<StatusView />);
    await waitFor(() => expectRow("Local content safeguards", "Disabled · source: user"));
    expectRow("Skipped (safeguards disabled)", "4");
  });

  it("re-fetches the live status when the settings-store safety toggle flips", async () => {
    render(<StatusView />);
    await waitFor(() => expect(mocks.getSafetyRuntimeStatus).toHaveBeenCalledTimes(1));
    act(() => {
      useSettingsStore.setState({ localFamilySafeModeEnabled: false } as never);
    });
    await waitFor(() => expect(mocks.getSafetyRuntimeStatus).toHaveBeenCalledTimes(2));
  });
});
