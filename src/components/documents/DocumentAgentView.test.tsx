import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "../../stores/project-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useDocumentAgentStore } from "../../stores/document-agent-store";

const askDecision = vi.hoisted(() => vi.fn());
const listDocuments = vi.hoisted(() => vi.fn());
const readDocument = vi.hoisted(() => vi.fn());
const listRevisions = vi.hoisted(() => vi.fn());
const deleteDocument = vi.hoisted(() => vi.fn());

vi.mock("../ui/modal-requests", () => ({ askDecision }));
vi.mock("../../services/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/desktopBridge")>();
  return {
    ...actual,
    isElectron: () => true,
    desktopDocumentAgent: {
    permissions: { set: vi.fn(async ({ preset }) => ({ ok: true, preset })) },
    documents: {
      list: listDocuments,
      read: readDocument,
      listRevisions,
      delete: deleteDocument,
      create: vi.fn(),
      export: vi.fn(),
      proposeEdits: vi.fn(),
      proposeRestore: vi.fn(),
    },
    approvals: {
      list: vi.fn(async () => ({ ok: true, pending: [] })),
      approve: vi.fn(),
      reject: vi.fn(),
    },
    workspace: { list: vi.fn(), search: vi.fn(), read: vi.fn(), choose: vi.fn(), revoke: vi.fn() },
    },
  };
});

import { DocumentAgentView } from "./DocumentAgentView";

describe("DocumentAgentView managed document deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      projects: [{
        id: "project_1",
        name: "Project One",
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        version: 1,
      }],
      loaded: true,
      loading: false,
      lastError: null,
    });
    useSettingsStore.setState({ activeProjectId: "project_1" });
    useDocumentAgentStore.setState({
      activeEnvironment: "managed",
      selectedDocumentId: "doc_1",
      workspaceGrant: null,
    });
    listDocuments
      .mockResolvedValueOnce({
        ok: true,
        documents: [{
          id: "doc_1",
          projectId: "project_1",
          displayName: "notes.md",
          libraryRelativePath: "notes.md",
          originalFormat: "md",
          currentRevisionId: "rev_1",
          createdAt: "2026-08-23T00:00:00.000Z",
          updatedAt: "2026-08-23T00:00:00.000Z",
          metadata: {},
          sensitivity: "normal",
        }],
      })
      .mockResolvedValue({ ok: true, documents: [] });
    readDocument.mockResolvedValue({
      ok: true,
      result: {
        documentId: "doc_1",
        revisionId: "rev_1",
        displayName: "notes.md",
        format: "md",
        blocks: [{ id: "p_1", type: "paragraph", text: "Keep this until confirmed." }],
        nextCursor: null,
        totalBlocks: 1,
        contentHash: "hash_1",
        warnings: [],
      },
    });
    listRevisions.mockResolvedValue({ ok: true, revisions: [] });
    deleteDocument.mockResolvedValue({ ok: true, deleted: true });
    askDecision.mockResolvedValue(true);
  });

  it("confirms deletion, calls the desktop bridge, and clears the selected document", async () => {
    render(<DocumentAgentView />);

    await screen.findByRole("heading", { name: "notes.md" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(askDecision).toHaveBeenCalledWith(expect.objectContaining({ danger: true })));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith({ documentId: "doc_1" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "notes.md" })).not.toBeInTheDocument());
    expect(useDocumentAgentStore.getState().selectedDocumentId).toBeNull();
    expect(listDocuments).toHaveBeenCalledTimes(2);
  });

  it("exposes the working-group selector with its visible accessible name", async () => {
    render(<DocumentAgentView />);

    expect(
      await screen.findByRole("combobox", { name: "Working Group" }),
    ).toHaveValue("project_1");
  });
});
