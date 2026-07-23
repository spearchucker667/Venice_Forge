import { describe, it, expect, vi } from "vitest";
import { executeAgentTool } from "./agent-tool-executor";
import type { AssistantToolCall } from "../../../src/types/venice";

vi.mock("./agent-services", () => {
  return {
    getAgentServices: () => ({
      documents: {
        create: vi.fn().mockResolvedValue({
          document: {
            id: "doc_123",
            projectId: "proj_456",
            libraryRelativePath: "notes/spec.md",
            displayName: "notes/spec.md",
            originalFormat: "md",
          },
          revision: {
            id: "rev_789",
          },
        }),
      },
      audit: {
        record: vi.fn().mockResolvedValue(undefined),
      },
    }),
  };
});

describe("agent-tool-executor documents", () => {
  it("executes document.create with canonical document property and returns chatDocumentRef", async () => {
    const toolCall: AssistantToolCall = {
      id: "call_1",
      type: "function",
      function: {
        name: "document_create",
        arguments: JSON.stringify({
          projectId: "proj_456",
          relativePath: "notes/spec.md",
          format: "md",
          document: "# My Title\n\nSome body content.",
          overwrite: false,
        }),
      },
    };

    const result = await executeAgentTool("profile_1", toolCall);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as Record<string, unknown>;
      expect(data.documentId).toBe("doc_123");
      expect(data.chatDocumentRef).toEqual({
        documentId: "doc_123",
        projectId: "proj_456",
        relativePath: "notes/spec.md",
        displayName: "notes/spec.md",
        format: "md",
        revisionId: "rev_789",
      });
    }
  });

  it("rejects document.create when overwrite is true", async () => {
    const toolCall: AssistantToolCall = {
      id: "call_2",
      type: "function",
      function: {
        name: "document_create",
        arguments: JSON.stringify({
          projectId: "proj_456",
          relativePath: "notes/spec.md",
          format: "md",
          document: "Content",
          overwrite: true,
        }),
      },
    };

    const result = await executeAgentTool("profile_1", toolCall);
    expect(result.ok).toBe(false);
  });
});
