// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SettingsView } from "./SettingsView";
import { useAuthStore } from "../stores/auth-store";
import { useSettingsStore } from "../stores/settings-store";
import { useChatStore } from "../stores/chat-store";
import { toast } from "../stores/toast-store";
import { desktopConfig, isElectron } from "../services/desktopBridge";

vi.mock("../services/desktopBridge", async () => {
  const actual = await vi.importActual<typeof import("../services/desktopBridge")>(
    "../services/desktopBridge",
  );
  return {
    ...actual,
    isElectron: vi.fn(() => false),
    desktopApiKey: { test: vi.fn(), set: vi.fn(), delete: vi.fn(), isConfigured: vi.fn() },
    desktopJinaApiKey: {
      test: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      isConfigured: vi.fn().mockResolvedValue(false),
    },
    desktopApp: { getVersion: vi.fn().mockResolvedValue("1.0.0-test") },
    desktopFiles: {
      exportJson: vi.fn().mockResolvedValue(true),
      importJsonString: vi.fn().mockResolvedValue(null),
      exportYaml: vi.fn().mockResolvedValue(true),
    },
    desktopConfig: {
      writeSanitized: vi.fn().mockResolvedValue({ ok: true }),
      get: vi.fn(),
      reload: vi.fn().mockResolvedValue({ ok: true }),
      openFolder: vi.fn(),
    },
    desktopUpdates: {
      checkForUpdates: vi.fn(),
      installUpdate: vi.fn(),
      onUpdateAvailable: vi.fn(() => () => {}),
      onUpdateNotAvailable: vi.fn(() => () => {}),
      onDownloadProgress: vi.fn(() => () => {}),
      onUpdateDownloaded: vi.fn(() => () => {}),
      onUpdateError: vi.fn(() => () => {}),
    },
  };
});

vi.mock("../hooks/use-models", () => ({
  useModels: () => ({ data: [] }),
}));

vi.mock("../hooks/useFocusTrap", () => ({
  useFocusTrap: () => {},
}));

vi.mock("../stores/config-store", () => ({
  reloadConfig: vi.fn(),
  useConfigStore: (selector?: (s: { config: null; status: null; loading: boolean; error: null }) => unknown) => {
    const state = { config: null, status: null, loading: false, error: null };
    return selector ? selector(state) : state;
  },
}));

vi.mock("../services/chatStorage", () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  saveConversation: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/memoryService", () => ({
  listMemories: vi.fn().mockResolvedValue([]),
  upsertMemory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/exportImport", () => ({
  createExportPayload: vi.fn().mockReturnValue({ version: "1.0.0-test", data: {} }),
  validateImportJson: vi.fn().mockReturnValue({ payload: { data: {} }, summary: {} }),
}));

vi.mock("../services/storageService", () => ({
  default: {
    clearStore: vi.fn().mockResolvedValue(undefined),
    getItems: vi.fn().mockResolvedValue([]),
    saveItem: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("SettingsView API key safety controls", () => {
  beforeEach(() => {
    vi.mocked(isElectron).mockReturnValue(false);
    vi.mocked(desktopConfig.writeSanitized).mockReset().mockResolvedValue({ ok: true });

    useAuthStore.setState({
      isConfigured: false,
      apiKey: null,
      setApiKey: vi.fn().mockResolvedValue(undefined),
      clearApiKey: vi.fn().mockResolvedValue(undefined),
      setJinaApiKey: vi.fn(),
      clearJinaApiKey: vi.fn(),
      checkConfiguration: vi.fn(),
      hasEncrypted: true,
      jinaApiKey: null,
      jinaIsConfigured: false,
    });
    useSettingsStore.setState({
      selectedModels: {},
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
    });
    useChatStore.setState({
      systemPrompt: "",
      veniceParams: {
        include_venice_system_prompt: false,
        enable_web_search: "off",
        enable_web_citations: false,
      },
    });
  });

  it("uses a password input for the Venice API key when not configured", () => {
    render(<SettingsView />);
    const input = screen.getByPlaceholderText("sk-...");
    expect(input).toHaveAttribute("type", "password");
  });

  it("disables Save Key until a non-empty key is entered", async () => {
    render(<SettingsView />);
    const saveButton = screen.getAllByRole("button", { name: "Save Key" })[0];
    expect(saveButton).toBeDisabled();

    const input = screen.getByPlaceholderText("sk-...");
    await userEvent.type(input, "sk-test");

    expect(saveButton).toBeEnabled();
  });

  it("persists the Venice key and clears the input on Save", async () => {
    const setApiKey = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ setApiKey });
    const successSpy = vi.spyOn(toast, "success");

    render(<SettingsView />);

    const input = screen.getByPlaceholderText("sk-...");
    await userEvent.type(input, "sk-secret123");
    fireEvent.click(screen.getAllByRole("button", { name: "Save Key" })[0]);

    await waitFor(() => expect(setApiKey).toHaveBeenCalledWith("sk-secret123"));
    expect(successSpy).toHaveBeenCalledWith("Venice API key saved securely.");
    expect(input).toHaveValue("");
  });

  it("shows masked key, Test, and Delete when configured", () => {
    useAuthStore.setState({ isConfigured: true });
    render(<SettingsView />);

    expect(screen.getByDisplayValue("••••••••••••••••••••••••••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("SettingsView safety toggles", () => {
  beforeEach(() => {
    vi.mocked(isElectron).mockReturnValue(false);
    vi.mocked(desktopConfig.writeSanitized).mockReset().mockResolvedValue({ ok: true });

    useAuthStore.setState({
      isConfigured: true,
      apiKey: null,
      setApiKey: vi.fn(),
      clearApiKey: vi.fn(),
      setJinaApiKey: vi.fn(),
      clearJinaApiKey: vi.fn(),
      checkConfiguration: vi.fn(),
      hasEncrypted: true,
      jinaApiKey: null,
      jinaIsConfigured: false,
    });
    useSettingsStore.setState({
      selectedModels: {},
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
    });
    useChatStore.setState({
      systemPrompt: "",
      veniceParams: {
        include_venice_system_prompt: false,
        enable_web_search: "off",
        enable_web_citations: false,
      },
    });
  });

  it("toggles Family Safe Mode and reverts with a toast when persistence fails", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopConfig.writeSanitized).mockResolvedValue({ ok: false, error: "Disk full" });
    const errorSpy = vi.spyOn(toast, "error");

    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "Safety" }));

    const familyToggle = await screen.findByRole("checkbox", {
      name: /Family Safe Mode/i,
    });
    expect(familyToggle).toBeChecked();

    fireEvent.click(familyToggle);

    await waitFor(() => expect(desktopConfig.writeSanitized).toHaveBeenCalled());
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith("Disk full"));
    expect(useSettingsStore.getState().localFamilySafeModeEnabled).toBe(true);
  });

  it("persists Venice API Safe Mode on toggle in Electron mode", async () => {
    vi.mocked(isElectron).mockReturnValue(true);

    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "Safety" }));

    const apiSafeToggle = await screen.findByRole("checkbox", {
      name: /Venice API Safe Mode/i,
    });
    expect(apiSafeToggle).toBeChecked();

    fireEvent.click(apiSafeToggle);

    await waitFor(() => expect(desktopConfig.writeSanitized).toHaveBeenCalled());
    expect(useSettingsStore.getState().veniceApiSafeMode).toBe(false);
  });
});
