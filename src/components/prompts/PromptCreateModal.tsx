import { translateRuntime } from "../../i18n/runtimeTranslator";
import React, { useId, useRef, useState } from "react";
import type { PromptKind, PromptScope } from "../../types/prompt-library";
import { useProjectStore } from "../../stores/project-store";
import { AccessibleDialog } from "../ui/AccessibleDialog";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  onClose: () => void;
  onCreate: (data: {
    title: string;
    kind: PromptKind;
    scope: PromptScope;
    projectId: string | null;
    content: string;
    negativeContent?: string;
    tags: string[];
  }) => Promise<void>;
}

const KIND_OPTIONS: Array<{ value: PromptKind; label: string }> = [
  {
    value: "image",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.image",
        "Image",
      );
    },
  },
  {
    value: "negative",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.negative",
        "Negative",
      );
    },
  },
  {
    value: "chat",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.chat",
        "Chat",
      );
    },
  },
  {
    value: "system",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.system",
        "System",
      );
    },
  },
  {
    value: "research",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.research",
        "Research",
      );
    },
  },
  {
    value: "character",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.character",
        "Character",
      );
    },
  },
  {
    value: "workflow",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.workflow",
        "Workflow",
      );
    },
  },
  {
    value: "recipe",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.recipe",
        "Recipe",
      );
    },
  },
  {
    value: "general",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.metadata.general",
        "General",
      );
    },
  },
];

export function PromptCreateModal({ onClose, onCreate }: Props) {
  const { t: tRuntime } = useTranslation("common");
  const projects = useProjectStore((s) => s.projects);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PromptKind>("general");
  const [scope, setScope] = useState<PromptScope>("global");
  const [projectId, setProjectId] = useState<string>("");
  const [content, setContent] = useState("");
  const [negativeContent, setNegativeContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const titleId = useId();
  const kindId = useId();
  const scopeId = useId();
  const projectIdField = useId();
  const tagsId = useId();
  const contentId = useId();
  const negativeId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (scope === "project" && !projectId) return;

    setIsSubmitting(true);
    setError("");
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .map((t) => t.slice(0, 64))
      .slice(0, 64);

    try {
      await onCreate({
        title: title.trim(),
        kind,
        scope,
        projectId: scope === "project" ? projectId : null,
        content: content.trim(),
        negativeContent: negativeContent.trim() || undefined,
        tags: Array.from(new Set(tags)),
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Prompt could not be created. Review the fields and try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <AccessibleDialog
      title={tRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.attribute.createNewPrompt",
      )}
      description={tRuntime(
        "runtimeGenerated.components.prompts.promptcreatemodal.attribute.saveReusablePromptContentAndMetadataToYourEncryptedPrompt",
      )}
      onClose={onClose}
      initialFocusRef={titleRef}
      panelRef={dialogRef}
      panelClassName="max-w-[500px]"
      headerAction={
        <button
          type="button"
          onClick={onClose}
          aria-label={tRuntime(
            "runtimeGenerated.components.prompts.promptcreatemodal.attribute.closeCreatePromptDialog",
          )}
          className="btn icon"
        >
          ✕
        </button>
      }
    >
      <div className="flex-1 overflow-y-auto p-5">
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div>
            <label
              htmlFor={titleId}
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.label.title" />
            </label>
            <input
              ref={titleRef}
              id={titleId}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-vf-shell-bg border border-vf-panel-border rounded-md px-3 py-2 text-[13px] focus:border-accent"
              placeholder={tRuntime(
                "runtimeGenerated.components.prompts.promptcreatemodal.attribute.eGDarkFantasyPortrait",
              )}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={kindId}
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.label.kind" />
              </label>
              <select
                id={kindId}
                value={kind}
                onChange={(e) => setKind(e.target.value as PromptKind)}
                className="w-full bg-vf-shell-bg border border-vf-panel-border rounded-md px-3 py-2 text-[13px] focus:border-accent"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={scopeId}
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.label.scope" />
              </label>
              <select
                id={scopeId}
                value={scope}
                onChange={(e) => setScope(e.target.value as PromptScope)}
                className="w-full bg-vf-shell-bg border border-vf-panel-border rounded-md px-3 py-2 text-[13px] focus:border-accent"
              >
                <option value="global">
                  <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.option.global" />
                </option>
                <option value="project">
                  <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.option.project" />
                </option>
              </select>
            </div>
          </div>
          {scope === "project" && (
            <div>
              <label
                htmlFor={projectIdField}
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.label.project" />
              </label>
              <select
                id={projectIdField}
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-vf-shell-bg border border-vf-panel-border rounded-md px-3 py-2 text-[13px] focus:border-accent"
              >
                <option value="" disabled>
                  <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.option.selectAProject" />
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              htmlFor={tagsId}
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.label.tags" />
            </label>
            <input
              id={tagsId}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full bg-vf-shell-bg border border-vf-panel-border rounded-md px-3 py-2 text-[13px] focus:border-accent"
              placeholder={tRuntime(
                "runtimeGenerated.components.prompts.promptcreatemodal.attribute.eGDarkFantasyPortraitLighting",
              )}
              aria-describedby={`${tagsId}-help`}
            />
            <p id={`${tagsId}-help`} className="mt-1 text-xs text-text-muted">
              <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.description.commaSeparatedUpTo64TagsAnd" />
            </p>
          </div>
          <div>
            <label
              htmlFor={contentId}
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.label.content" />
            </label>
            <textarea
              id={contentId}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-vf-shell-bg border border-vf-panel-border rounded-md px-3 py-2 text-[13px] font-mono focus:border-accent resize-y min-h-[100px]"
              placeholder={tRuntime(
                "runtimeGenerated.components.prompts.promptcreatemodal.attribute.enterPromptTextHere",
              )}
            />
          </div>
          {(kind === "image" || kind === "recipe" || kind === "general") && (
            <div>
              <label
                htmlFor={negativeId}
                className="block text-xs font-medium text-text-secondary mb-1"
              >
                <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.label.negativeContent" />
              </label>
              <textarea
                id={negativeId}
                value={negativeContent}
                onChange={(e) => setNegativeContent(e.target.value)}
                rows={2}
                className="w-full bg-vf-shell-bg border border-vf-panel-border rounded-md px-3 py-2 text-[13px] font-mono focus:border-accent resize-y min-h-[60px]"
                placeholder={tRuntime(
                  "runtimeGenerated.components.prompts.promptcreatemodal.attribute.optionalNegativePrompt",
                )}
              />
            </div>
          )}
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="px-5 py-4 border-t border-vf-panel-border flex justify-end gap-3 bg-vf-panel-bg-raised/30">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 text-[12.5px] rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary"
        >
          <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.action.cancel" />
        </button>
        <button
          type="submit"
          form={formId}
          disabled={
            isSubmitting ||
            !title.trim() ||
            !content.trim() ||
            (scope === "project" && !projectId)
          }
          className="px-4 py-2 text-[12.5px] rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 font-medium shadow-[0_0_8px_var(--color-vf-accent-glow)]"
        >
          <Trans i18nKey="common:surface.componentsPromptsPromptcreatemodal.action.createPrompt" />
        </button>
      </div>
    </AccessibleDialog>
  );
}
