import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CharacterCreatorView } from "./CharacterCreatorView";
import * as aiService from "../../services/characterCreatorAiService";
import StorageService from "../../services/storageService";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useCharacterCreatorLaunchStore } from "../../stores/character-creator-launch-store";
import { CHARACTER_CREATOR_MODEL_ID } from "../../constants/character-creator";
import { SafetyGuardBlockedError } from "../../shared/safety";
import type { SafetyGuardDecision } from "../../shared/safety";

vi.mock("../../services/storageService", () => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    default: {
      getItems: vi.fn(async () => Array.from(store.values())),
      saveItem: vi.fn(async (storeName: string, item: Record<string, unknown>) => {
        store.set(String(item.id), item);
        return item;
      }),
      deleteItem: vi.fn(async (storeName: string, id: string) => {
        store.delete(id);
        return true;
      }),
      _clear: () => store.clear(),
    },
  };
});

vi.mock("../../services/characterCreatorAiService", async () => {
  const actual = await vi.importActual("../../services/characterCreatorAiService");
  return {
    ...actual,
    generateCharacterCreatorDraft: vi.fn(),
    createCharacterDraftAI: vi.fn(),
    reviseCharacterDraftAI: vi.fn(),
    regenerateCharacterFieldAI: vi.fn(),
  };
});

vi.mock("../../hooks/use-models", () => ({
  useModels: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

describe("CharacterCreatorView Component", () => {
  beforeEach(() => {
    (StorageService as any)._clear();
    useCharacterCardStore.setState({ cards: [] });
    useCharacterCreatorLaunchStore.getState().clear();
    useSettingsStore.getState().setActiveTab("character-creator");
    vi.clearAllMocks();
  });

  it("renders splash screen with hero text, instructions, and no model selector", async () => {
    render(<CharacterCreatorView />);

    expect(screen.getByText("Character Creator")).toBeInTheDocument();
    expect(screen.getByText("Turn a rough idea into a complete, editable character card.")).toBeInTheDocument();
    expect(screen.getByText(/GLM 5.2/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /model/i })).not.toBeInTheDocument();
  });

  it("consumes pending launch intent on mount", async () => {
    useCharacterCreatorLaunchStore.getState().launch({
      mode: "new-from-idea",
      sourceIdea: "Batman-inspired detective",
    });

    const mockResult = {
      analysis: {
        normalizedConcept: "Batman-inspired detective",
        intendedMode: "original" as const,
        coreTraits: ["detective"],
        settingDirection: "",
        relationshipDirection: "",
        toneDirection: "",
        originalityPlan: [],
        assumptions: [],
        warnings: [],
        userVisibleSummary: "Summary",
      },
      response: {
        operation: "create_draft" as const,
        design_summary: "Batman inspired hero",
        assumptions: ["Original character name created"],
        warnings: [],
        draft: {
          spec: "chara_card_v2" as const,
          spec_version: "2.0" as const,
          data: {
            name: "Shadow Knight",
            description: "Nocturnal protector",
            personality: "Brooding",
            scenario: "Gotham roof",
            first_mes: "I watch over the city.",
            mes_example: "",
            creator_notes: "",
            system_prompt: "",
            post_history_instructions: "",
            alternate_greetings: [],
            tags: ["hero"],
            creator: "Venice Forge",
            character_version: "1.0",
            extensions: {},
          },
        },
        validation: { valid: true, errors: [], warnings: [], recommendations: [] },
      },
      processEvents: [
        {
          id: "ev_1",
          phase: "concept-analysis" as const,
          status: "complete" as const,
          title: "Concept analysis complete",
          summary: "Parsed idea",
          source: "model-summary" as const,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    vi.mocked(aiService.generateCharacterCreatorDraft).mockResolvedValueOnce(mockResult);

    render(<CharacterCreatorView />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Shadow Knight")).toBeInTheDocument();
    });

    expect(aiService.generateCharacterCreatorDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "create_draft",
        sourceIdea: "Batman-inspired detective",
      }),
      expect.any(Object),
      expect.anything(),
    );
  });

  it("handles model unavailability gracefully and displays a user-facing message", async () => {
    vi.mocked(aiService.generateCharacterCreatorDraft).mockRejectedValueOnce(
      new aiService.CharacterCreatorServiceError(
        "MODEL_UNAVAILABLE",
        `MODEL_UNAVAILABLE: Model '${CHARACTER_CREATOR_MODEL_ID}' is currently unavailable on Venice API.`,
        false,
      ),
    );

    render(<CharacterCreatorView />);

    const input = screen.getByPlaceholderText(/I want a brooding nocturnal detective/i);
    fireEvent.change(input, { target: { value: "Test concept" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Draft/i }));

    await waitFor(() => {
      expect(screen.getByText("Character Creator Error")).toBeInTheDocument();
      expect(
        screen.getByText(
          "The Character Creator model is temporarily unavailable. Please try again in a few minutes.",
        ),
      ).toBeInTheDocument();
    });
    // Raw code prefixes are dev-log only and must not reach the UI.
    expect(screen.queryByText(/MODEL_UNAVAILABLE/i)).not.toBeInTheDocument();
  });

  it("surfaces the actual safety category when generation is blocked", async () => {
    const decision: SafetyGuardDecision = {
      allow: false,
      action: "block",
      severity: "critical",
      category: "csam_request",
      reasonCode: "CSAM_GENRE_TERM",
      userMessage: "Blocked: mandatory child-safety protection triggered.",
      developerMessage: "CSAM genre label detected.",
      normalizedChanged: false,
      signals: [],
      audit: {
        decisionId: "test-decision",
        createdAt: new Date().toISOString(),
        promptHash: "00000000",
        promptLength: 4,
        matchedFieldPaths: [],
      },
    };
    vi.mocked(aiService.generateCharacterCreatorDraft).mockRejectedValueOnce(
      new SafetyGuardBlockedError(decision),
    );

    render(<CharacterCreatorView />);

    const input = screen.getByPlaceholderText(/I want a brooding nocturnal detective/i);
    fireEvent.change(input, { target: { value: "draw me a loli character" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Draft/i }));

    await waitFor(() => {
      expect(screen.getByText("Character Creator Error")).toBeInTheDocument();
      expect(screen.getByText(/Blocking layer: Mandatory child safety/i)).toBeInTheDocument();
      expect(screen.getByText(/Category: CSAM or child exploitation/i)).toBeInTheDocument();
      expect(screen.getByText(/Reason code: CSAM_GENRE_TERM/i)).toBeInTheDocument();
    });
  });

  it("formats a serializable safety block result without relying on Error subclasses", async () => {
    vi.mocked(aiService.generateCharacterCreatorDraft).mockRejectedValueOnce({
      kind: "safety-block",
      layer: "provider-policy",
      category: "provider-restriction",
      reasonCode: "PROVIDER_SAFE_MODE",
      userMessage: "Provider policy violation.",
    });

    render(<CharacterCreatorView />);

    const input = screen.getByPlaceholderText(/I want a brooding nocturnal detective/i);
    fireEvent.change(input, { target: { value: "blocked concept" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Draft/i }));

    await waitFor(() => {
      expect(screen.getByText("Character Creator Error")).toBeInTheDocument();
      expect(screen.getByText(/Blocking layer: Provider policy/i)).toBeInTheDocument();
      expect(screen.getByText(/Category: Provider restriction/i)).toBeInTheDocument();
      expect(screen.getByText(/Reason code: PROVIDER_SAFE_MODE/i)).toBeInTheDocument();
    });
  });

  it("requires explicit user approval before saving character card into local library", async () => {
    const mockResult = {
      analysis: {
        normalizedConcept: "Create hero",
        intendedMode: "original" as const,
        coreTraits: [],
        settingDirection: "",
        relationshipDirection: "",
        toneDirection: "",
        originalityPlan: [],
        assumptions: [],
        warnings: [],
        userVisibleSummary: "Test Summary",
      },
      response: {
        operation: "create_draft" as const,
        design_summary: "Test Summary",
        assumptions: [],
        warnings: [],
        draft: {
          spec: "chara_card_v2" as const,
          spec_version: "2.0" as const,
          data: {
            name: "Vigilante Hero",
            description: "Bio text",
            personality: "Stern",
            scenario: "City street",
            first_mes: "Hello.",
            mes_example: "",
            creator_notes: "",
            system_prompt: "",
            post_history_instructions: "",
            alternate_greetings: [],
            tags: [],
            creator: "Venice Forge",
            character_version: "1.0",
            extensions: {},
          },
        },
        validation: { valid: true, errors: [], warnings: [], recommendations: [] },
      },
      processEvents: [],
    };

    vi.mocked(aiService.generateCharacterCreatorDraft).mockResolvedValueOnce(mockResult);

    render(<CharacterCreatorView />);

    fireEvent.change(screen.getByPlaceholderText(/I want a brooding nocturnal detective/i), {
      target: { value: "Create hero" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create Draft/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Vigilante Hero")).toBeInTheDocument();
    });

    // Local library must still be empty before explicit approval
    expect(useCharacterCardStore.getState().cards.length).toBe(0);

    // Click Approve & Create Character in Editor -> goes to Ready screen
    fireEvent.click(screen.getByRole("button", { name: /Approve & Create Character/i }));

    await waitFor(() => {
      expect(screen.getByText("Character Ready for Approval")).toBeInTheDocument();
    });

    // Click Create Character on Ready screen -> explicit approval
    fireEvent.click(screen.getByRole("button", { name: /Create Character/i }));

    await waitFor(() => {
      expect(screen.getByText("Character Created")).toBeInTheDocument();
    });

    expect(useCharacterCardStore.getState().cards.length).toBe(1);
    expect(useCharacterCardStore.getState().cards[0].name).toBe("Vigilante Hero");
  });

  it("aborts the superseded controller so only the latest generation writes state", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const pendingCalls: Array<{
      signal: AbortSignal;
      resolve: (value: unknown) => void;
      reject: (err: unknown) => void;
    }> = [];

    vi.mocked(aiService.generateCharacterCreatorDraft).mockImplementation(
      (_request, _callbacks, signal) =>
        new Promise((resolve, reject) => {
          if (!signal) throw new Error("expected abort signal");
          pendingCalls.push({ signal, resolve, reject });
          signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        }) as any,
    );

    render(<CharacterCreatorView />);

    fireEvent.change(
      screen.getByPlaceholderText(/I want a brooding nocturnal detective/i),
      { target: { value: "First concept" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Create Draft/i }));

    await waitFor(() => expect(pendingCalls.length).toBe(1));

    // A newer launch intent supersedes the in-flight generation.
    useCharacterCreatorLaunchStore.getState().launch({
      mode: "new-from-idea",
      sourceIdea: "Second concept",
    });
    act(() => {
      useSettingsStore.getState().setActiveTab("chat");
    });
    act(() => {
      useSettingsStore.getState().setActiveTab("character-creator");
    });

    await waitFor(() => expect(pendingCalls.length).toBe(2));

    expect(abortSpy).toHaveBeenCalled();
    expect(pendingCalls[0].signal.aborted).toBe(true);
    expect(pendingCalls[1].signal.aborted).toBe(false);

    // Only the latest request completes and writes state.
    pendingCalls[1].resolve({
      analysis: {
        normalizedConcept: "Second concept",
        intendedMode: "original" as const,
        coreTraits: [],
        settingDirection: "",
        relationshipDirection: "",
        toneDirection: "",
        originalityPlan: [],
        assumptions: [],
        warnings: [],
        userVisibleSummary: "Second Summary",
      },
      response: {
        operation: "create_draft" as const,
        design_summary: "Second Summary",
        assumptions: [],
        warnings: [],
        draft: {
          spec: "chara_card_v2" as const,
          spec_version: "2.0" as const,
          data: {
            name: "Second Hero",
            description: "Second bio",
            personality: "Stoic",
            scenario: "City street",
            first_mes: "Hello.",
            mes_example: "",
            creator_notes: "",
            system_prompt: "",
            post_history_instructions: "",
            alternate_greetings: [],
            tags: [],
            creator: "Venice Forge",
            character_version: "1.0",
            extensions: {},
          },
        },
        validation: { valid: true, errors: [], warnings: [], recommendations: [] },
      },
      processEvents: [],
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Second Hero")).toBeInTheDocument();
    });
    // The superseded request must not surface an error or rewind the view.
    expect(screen.queryByText("Character Creator Error")).not.toBeInTheDocument();

    abortSpy.mockRestore();
  });

  it("preserves manually entered draft fields when a revise request fails", async () => {
    const mockResult = {
      analysis: {
        normalizedConcept: "Create hero",
        intendedMode: "original" as const,
        coreTraits: [],
        settingDirection: "",
        relationshipDirection: "",
        toneDirection: "",
        originalityPlan: [],
        assumptions: [],
        warnings: [],
        userVisibleSummary: "Test Summary",
      },
      response: {
        operation: "create_draft" as const,
        design_summary: "Test Summary",
        assumptions: [],
        warnings: [],
        draft: {
          spec: "chara_card_v2" as const,
          spec_version: "2.0" as const,
          data: {
            name: "Vigilante Hero",
            description: "Bio text",
            personality: "Stern",
            scenario: "City street",
            first_mes: "Hello.",
            mes_example: "",
            creator_notes: "",
            system_prompt: "",
            post_history_instructions: "",
            alternate_greetings: [],
            tags: [],
            creator: "Venice Forge",
            character_version: "1.0",
            extensions: {},
          },
        },
        validation: { valid: true, errors: [], warnings: [], recommendations: [] },
      },
      processEvents: [],
    };

    vi.mocked(aiService.generateCharacterCreatorDraft).mockResolvedValueOnce(mockResult);
    vi.mocked(aiService.reviseCharacterDraftAI).mockRejectedValueOnce(
      new aiService.CharacterCreatorServiceError(
        "VENICE_TRANSPORT_FAILED",
        "VENICE_TRANSPORT_FAILED: network down",
        true,
      ),
    );

    render(<CharacterCreatorView />);

    fireEvent.change(
      screen.getByPlaceholderText(/I want a brooding nocturnal detective/i),
      { target: { value: "Create hero" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Create Draft/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Vigilante Hero")).toBeInTheDocument();
    });

    // User manually edits a field before requesting a revision.
    fireEvent.change(screen.getByDisplayValue("Vigilante Hero"), {
      target: { value: "Manual Hero Rename" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/Make her less hostile/i),
      { target: { value: "make them wittier" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Revise Whole Draft/i }));

    await waitFor(() => {
      expect(screen.getByText("Character Creator Error")).toBeInTheDocument();
    });
    // The typed code maps to a user-facing message, not a raw prefix.
    expect(
      screen.getByText(
        "Could not reach the Venice API. Please check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VENICE_TRANSPORT_FAILED/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Return to Draft/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Manual Hero Rename")).toBeInTheDocument();
    });
  });
});
