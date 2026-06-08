import { describe, it, expect } from "vitest";
import {
  sanitizeWorkflowTemplateItem,
  createWorkflowTemplateItem,
  exportWorkflowTemplateItems,
  parseWorkflowTemplateImport,
  type WorkflowTemplateItem,
  type WorkflowStep,
  WORKFLOW_TEMPLATE_VERSION,
} from "./workflow";

describe("Workflow Templates Data Model", () => {
  describe("createWorkflowTemplateItem", () => {
    it("creates a valid item with defaults", () => {
      const item = createWorkflowTemplateItem({ title: "My Workflow" });
      expect(item.id).toBeDefined();
      expect(item.title).toBe("My Workflow");
      expect(item.scope).toBe("project");
      expect(item.versions).toHaveLength(1);
      expect(item.currentVersionId).toBe(item.versions[0].id);
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });

    it("respects provided scope and projectId", () => {
      const item = createWorkflowTemplateItem({ title: "Global", scope: "global", projectId: null });
      expect(item.scope).toBe("global");
      expect(item.projectId).toBeNull();
    });
  });

  describe("sanitizeWorkflowTemplateItem", () => {
    it("sanitizes components and targets", () => {
      const step: WorkflowStep = {
        id: "step1",
        kind: "prompt",
        title: "Test Step",
        enabled: true,
        order: 0,
        target: "chat",
      };
      
      const item = createWorkflowTemplateItem({
        title: "Test",
        versions: [
          {
            id: "v1",
            workflowId: "temp",
            version: 1,
            title: "V1",
            steps: [
              step,
              { ...step, id: "step2", kind: "invalid_kind" as any, target: "invalid_target" as any },
            ],
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const sanitized = sanitizeWorkflowTemplateItem(item);
      expect(sanitized.versions[0].steps[0].kind).toBe("prompt");
      expect(sanitized.versions[0].steps[0].target).toBe("chat");
      
      // Invalid kinds/targets should fallback
      expect(sanitized.versions[0].steps[1].kind).toBe("note");
      expect(sanitized.versions[0].steps[1].target).toBe("none");
    });

    it("redacts secrets from input and metadata", () => {
      const step: WorkflowStep = {
        id: "s1",
        kind: "note",
        title: "S1",
        enabled: true,
        order: 0,
        target: "none",
        input: { key: "sk-ant-api03-12345678901234567890" },
        metadata: { auth: "Bearer venice_12345678901234567890" }
      };

      const item = createWorkflowTemplateItem({
        title: "Test",
        versions: [{ id: "v1", workflowId: "temp", version: 1, title: "V1", steps: [step], createdAt: new Date().toISOString() }],
      });

      const sanitized = sanitizeWorkflowTemplateItem(item);
      expect(sanitized.versions[0].steps[0].input).toEqual({ key: "[REDACTED]" });
      expect(sanitized.versions[0].steps[0].metadata).toEqual({ auth: "Bearer [REDACTED]" });
    });
  });

  describe("import/export", () => {
    it("exports correctly, skipping items with raw secrets", () => {
      const safeItem = createWorkflowTemplateItem({ title: "Safe" });
      const unsafeItem = createWorkflowTemplateItem({ title: "My secret is sk-ant-api03-12345678901234567890" }); // Secret in title

      const exported = exportWorkflowTemplateItems([safeItem, unsafeItem]);
      expect(exported.version).toBe(WORKFLOW_TEMPLATE_VERSION);
      expect(exported.app).toBe("Venice Forge");
      expect(exported.workflows).toHaveLength(1);
      expect(exported.workflows[0].title).toBe("Safe");
    });

    it("imports correctly, rejecting executable code and regenerating IDs", () => {
      const safeItem = createWorkflowTemplateItem({ title: "Import Me" });
      const exported = exportWorkflowTemplateItems([safeItem]);

      const result = parseWorkflowTemplateImport(exported);
      expect(result.imported).toHaveLength(1);
      expect(result.skipped).toHaveLength(0);

      // Verify ID regeneration via the hidden _items property (used by tests/stores)
      const importedItem = (result as any)._items[0] as WorkflowTemplateItem;
      expect(importedItem.id).not.toBe(safeItem.id);
      expect(importedItem.versions[0].id).not.toBe(safeItem.versions[0].id);
      expect(importedItem.currentVersionId).toBe(importedItem.versions[0].id);
    });

    it("rejects imports with executable patterns", () => {
      const item = createWorkflowTemplateItem({
        title: "Test",
        metadata: { script: "exec('rm -rf /')" }
      });
      const exported = exportWorkflowTemplateItems([item]);

      const result = parseWorkflowTemplateImport(exported);
      expect(result.imported).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toMatch(/executable code patterns/);
    });
  });
});
