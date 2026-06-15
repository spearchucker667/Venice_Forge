import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../stores/settings-store", () => ({
  useSettingsStore: (selector: (state: { selectedModels: { embeddings: string } }) => unknown) =>
    selector({ selectedModels: { embeddings: "bge-m3" } }),
}));
vi.mock("../../stores/auth-store", () => ({
  selectHasVeniceKey: () => true,
  useAuthStore: (selector: (state: { isConfigured: boolean; apiKey: null }) => unknown) =>
    selector({ isConfigured: true, apiKey: null }),
}));
vi.mock("../../hooks/use-models", () => ({ useModels: () => ({ data: [{ id: "bge-m3" }] }) }));
vi.mock("../../hooks/use-embeddings", () => ({
  useEmbeddings: () => ({
    data: undefined,
    error: new Error("Authorization: Bearer secret sk-secret-fixture-123 /Users/private/request.json"),
    isPending: false,
    mutate: vi.fn(),
  }),
}));
vi.mock("../ui/generation-view", () => ({
  GenerationView: ({ controls, output }: { controls: ReactNode; output: ReactNode }) => (
    <div>{controls}{output}</div>
  ),
}));

import { EmbeddingsView } from "./embeddings-view";

describe("EmbeddingsView error handling", () => {
  it("redacts provider secrets and local paths", () => {
    render(<EmbeddingsView />);
    expect(screen.getByText(/redacted/i)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Bearer secret");
    expect(text).not.toContain("sk-secret-fixture-123");
    expect(text).not.toContain("/Users/private");
  });
});
