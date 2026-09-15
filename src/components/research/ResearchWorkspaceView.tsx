/** @fileoverview Research Workspace View (Phase 2I).
 *
 * This component provides the primary UI for managing research sessions,
 * running searches, scraping URLs, building findings, and generating summaries.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useResearchStore } from "../../stores/research-store";
import { useProjectStore } from "../../stores/project-store";
import {
  runResearchSearch,
  runResearchScrape,
} from "../../services/researchService";
import { buildResearchSummary } from "../../services/researchSummaries";
import { sanitizeResearchUrl } from "../../types/research";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import { toast } from "../../stores/toast-store";
import { askDecision, askText } from "../ui/modal-requests";
import { processFileAttachment } from "../../services/ingestion/attachmentAssembler";
import { redactErrorMessage } from "../../shared/redaction";
import { Meteocon } from "../ui/Meteocon";
import { Trans, useTranslation } from "react-i18next";

// Icons using Meteocons
const SearchIcon = () => <Meteocon name="compass" size={16} />;
const ScrapeIcon = () => <Meteocon name="horizon" size={16} />;
const PlusIcon = () => <Meteocon name="clear-day" size={14} />;
const TrashIcon = () => <Meteocon name="weather-alarm" size={14} />;
const ArchiveIcon = () => <Meteocon name="barometer" size={14} />;
const StarIcon = ({ filled }: { filled: boolean }) => (
  <Meteocon
    name="star"
    size={14}
    className={filled ? "text-amber-400 font-bold" : "opacity-40"}
  />
);
const UploadIcon = () => <Meteocon name="wind" size={16} />;

function SourceLink({
  title,
  url,
  onClick,
}: {
  title: string;
  url?: string;
  onClick?: (url: string) => void;
}) {
  const safeUrl = sanitizeResearchUrl(url);
  if (!safeUrl) {
    return <span>{title}</span>;
  }
  return (
    <a
      href={safeUrl}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick(safeUrl);
        }
      }}
      target={onClick ? undefined : "_blank"}
      rel={onClick ? undefined : "noreferrer"}
      className="hover:underline cursor-pointer"
    >
      {title}
    </a>
  );
}

export const ResearchWorkspaceView: React.FC = () => {
  const { t: tRuntime } = useTranslation("common");
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    deleteSession,
    archiveSession,
    toggleFavorite,
    addQuery,
    addSource,
    removeSource,
    addFinding,
    removeFinding,
    ensureResearchLoaded,
  } = useResearchStore();

  const activeProjectId = useProjectStore((s) => s.getActiveProjectId());
  const { createPrompt } = usePromptLibraryStore();
  const { createWorkflow } = useWorkflowTemplateStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionSidebarCollapsed, setSessionSidebarCollapsed] = useState(false);
  const [findingTitle, setFindingTitle] = useState("");
  const [findingContent, setFindingContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureResearchLoaded();
  }, [ensureResearchLoaded]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );

  const filteredSessions = useMemo(() => {
    if (activeProjectId === null) return sessions;
    return sessions.filter(
      (s) => s.scope === "global" || s.projectId === activeProjectId,
    );
  }, [sessions, activeProjectId]);

  const handleCreateSession = async () => {
    const title = (
      await askText({
        title: tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.metadata.researchTitle",
        ),
        initialValue: "New Research",
        actionLabel: "Create",
        validate: (value) => (value.trim() ? null : "Enter a title."),
      })
    )?.trim();
    if (title) await createSession({ title });
  };

  const handleDeleteSession = async (sessionId: string) => {
    const shouldDelete = await askDecision({
      title: tRuntime(
        "runtimeGenerated.components.research.researchworkspaceview.metadata.deleteSession",
      ),
      detail: "This removes the research session.",
      actionLabel: "Delete",
      danger: true,
    });
    if (!shouldDelete) return;
    setDeletingSessionId(sessionId);
    try {
      await deleteSession(sessionId);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.notification.sessionDeleted",
        ),
      );
    } catch (error) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.notification.sessionDeleteFailed",
        ),
        redactErrorMessage(error),
      );
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const result = await runResearchSearch({
        query: searchQuery,
        provider: "venice",
      });

      await addQuery(activeSession.id, searchQuery);
      for (const source of result.sources) {
        await addSource(activeSession.id, source);
      }

      if (result.warnings.length > 0) {
        toast.warn(
          tRuntime(
            "runtimeGenerated.components.research.researchworkspaceview.notification.searchFinishedWithValue1Warnings",
            { value1: result.warnings.length },
          ),
        );
      }
      setSearchQuery("");
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.notification.searchFailed",
        ),
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !scrapeUrl.trim()) return;

    setIsScraping(true);
    try {
      const result = await runResearchScrape({
        url: scrapeUrl,
        provider: "generic-http",
      });

      for (const source of result.sources) {
        await addSource(activeSession.id, source);
      }

      if (result.warnings.length > 0) {
        toast.warn(result.warnings[0].message);
      }
      setScrapeUrl("");
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.notification.scrapeFailed",
        ),
      );
    } finally {
      setIsScraping(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSession || !e.target.files?.length) return;

    setIsUploading(true);
    try {
      const files = Array.from(e.target.files);
      for (const file of files) {
        const attachment = await processFileAttachment(file);
        const textContent = attachment.text || "";
        await addSource(activeSession.id, {
          kind: "manual_note",
          title: attachment.name,
          summary: textContent,
          excerpt:
            textContent.substring(0, 200) +
            (textContent.length > 200 ? "..." : ""),
          provider: "manual",
          retrievedAt: new Date().toISOString(),
          citations: [],
          tags: [],
          metadata: {
            filename: attachment.name,
            extension: attachment.extension,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            extractionRoute: attachment.extraction.route,
            localFile: true,
          },
        });
        if (attachment.extraction.warnings.length > 0) {
          attachment.extraction.warnings.forEach((w) =>
            toast.warn(
              tRuntime(
                "runtimeGenerated.components.research.researchworkspaceview.notification.attachmentNote",
              ),
              w,
            ),
          );
        }
      }
      toast.success(
        tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.notification.fileSAddedToResearchSources",
        ),
      );
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.notification.fileUploadFailed",
        ),
        redactErrorMessage(err),
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddFinding = async () => {
    if (!activeSession || !findingTitle.trim() || !findingContent.trim())
      return;

    await addFinding(activeSession.id, {
      title: findingTitle,
      content: findingContent,
      sourceIds: [],
      citationIds: [],
      tags: [],
    });

    setFindingTitle("");
    setFindingContent("");
  };

  const handleSaveToLibrary = async () => {
    if (!activeSession) return;
    const result = buildResearchSummary({ session: activeSession });
    await createPrompt({
      title: result.title,
      content: result.summary,
      kind: "research",
      scope: activeSession.scope === "project" ? "project" : "global",
      projectId: activeSession.projectId,
      tags: ["research", ...activeSession.tags],
    });
    toast.success(
      tRuntime(
        "runtimeGenerated.components.research.researchworkspaceview.notification.summarySavedToPromptLibrary",
      ),
    );
  };

  const handleCreateWorkflow = async () => {
    if (!activeSession) return;
    const result = buildResearchSummary({ session: activeSession });
    await createWorkflow({
      title: tRuntime(
        "runtimeGenerated.components.research.researchworkspaceview.metadata.workflowValue1",
        { value1: result.title },
      ),
      description: tRuntime(
        "runtimeGenerated.components.research.researchworkspaceview.metadata.workflowGeneratedFromResearchSessionValue1",
        { value1: activeSession.title },
      ),
      steps: [
        {
          id: crypto.randomUUID(),
          title: tRuntime(
            "runtimeGenerated.components.research.researchworkspaceview.metadata.reviewResearchSummary",
          ),
          kind: "handoff",
          target: "chat",
          enabled: true,
          order: 0,
          input: { prompt: result.summary },
        },
      ],
      scope: activeSession.scope === "project" ? "project" : "global",
      projectId: activeSession.projectId,
      tags: ["research", ...activeSession.tags],
      source: {
        type: "research",
        sourceId: activeSession.id,
      },
    });
    toast.success(
      tRuntime(
        "runtimeGenerated.components.research.researchworkspaceview.notification.researchWorkflowCreated",
      ),
    );
  };

  return (
    <div className="flex h-full bg-bg text-text-primary overflow-hidden">
      {/* Sidebar - Session List */}
      <aside
        className={`${sessionSidebarCollapsed ? "w-12" : "w-[clamp(200px,22vw,256px)]"} flex-shrink-0 border-r border-vf-panel-border flex flex-col bg-vf-panel-bg transition-[width]`}
        aria-label={tRuntime(
          "runtimeGenerated.components.research.researchworkspaceview.attribute.researchSessions",
        )}
      >
        <div className="p-4 border-b border-vf-panel-border flex justify-between items-center">
          {!sessionSidebarCollapsed && (
            <h2 className="font-bold text-text-primary flex items-center gap-2">
              <Meteocon name="compass" size={18} />{" "}
              <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.heading.research" />
            </h2>
          )}
          <div className="flex items-center gap-1">
            {!sessionSidebarCollapsed && (
              <button
                type="button"
                onClick={handleCreateSession}
                className="p-2 hover:bg-vf-control-hover rounded text-text-secondary"
                aria-label={tRuntime(
                  "runtimeGenerated.components.research.researchworkspaceview.attribute.createResearchSession",
                )}
              >
                <span aria-hidden="true">
                  <PlusIcon />
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSessionSidebarCollapsed((value) => !value)}
              className="p-2 hover:bg-vf-control-hover rounded text-text-secondary"
              aria-label={
                sessionSidebarCollapsed
                  ? tRuntime(
                      "runtimeGenerated.components.research.researchworkspaceview.attribute.expandResearchSessions",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.research.researchworkspaceview.attribute.collapseResearchSessions",
                    )
              }
              aria-expanded={!sessionSidebarCollapsed}
            >
              ☰
            </button>
          </div>
        </div>
        {!sessionSidebarCollapsed && (
          <div
            className="flex-1 overflow-y-auto"
            role="listbox"
            aria-label={tRuntime(
              "runtimeGenerated.components.research.researchworkspaceview.attribute.researchSessions",
            )}
          >
            {filteredSessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-start border-b border-vf-panel-border transition-colors hover:bg-vf-control-hover ${activeSessionId === s.id ? "border-l-4 border-l-accent bg-vf-panel-bg-raised" : "border-l-4 border-l-transparent"}`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={activeSessionId === s.id}
                  aria-current={activeSessionId === s.id ? "true" : undefined}
                  onClick={() => setActiveSession(s.id)}
                  className="min-w-0 flex-1 p-3 text-left"
                >
                  <span
                    className={`block truncate text-text-primary ${activeSessionId === s.id ? "font-bold" : "font-medium"}`}
                  >
                    {s.title}
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {s.sources.length}{" "}
                    <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.text.sources" />{" "}
                    {s.findings.length}{" "}
                    <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.text.findings" />
                  </span>
                </button>
                <div className="p-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(s.id)}
                    className="text-text-muted hover:text-text-primary"
                    aria-label={
                      s.favorite
                        ? tRuntime(
                            "runtimeGenerated.components.research.researchworkspaceview.attribute.removeValue1FromFavorites",
                            { value1: s.title },
                          )
                        : tRuntime(
                            "runtimeGenerated.components.research.researchworkspaceview.attribute.addValue1ToFavorites",
                            { value1: s.title },
                          )
                    }
                  >
                    <span aria-hidden="true">
                      <StarIcon filled={s.favorite} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSession(s.id)}
                    disabled={deletingSessionId === s.id}
                    className="text-text-muted hover:text-danger transition-colors disabled:opacity-50"
                    aria-label={tRuntime(
                      "runtimeGenerated.components.research.researchworkspaceview.attribute.deleteSessionValue1",
                      { value1: s.title },
                    )}
                  >
                    <span aria-hidden="true">
                      <TrashIcon />
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeSession ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-vf-panel-border flex justify-between items-center bg-vf-panel-bg-raised">
              <div>
                <h1 className="text-xl font-bold text-text-primary">
                  {activeSession.title}
                </h1>
                <p className="text-xs text-text-muted">
                  {activeSession.scope}{" "}
                  <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.description.research" />
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateWorkflow}
                  className="px-3 py-1 bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-text-primary rounded text-sm transition-colors"
                >
                  <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.action.createWorkflow" />
                </button>
                <button
                  onClick={handleSaveToLibrary}
                  className="px-3 py-1 bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow)] shadow-[0_0_8px_var(--color-vf-accent-glow)] rounded text-sm transition-colors"
                >
                  <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.action.saveSummary" />
                </button>
                <button
                  type="button"
                  onClick={() => archiveSession(activeSession.id)}
                  className="p-2 hover:bg-vf-control-hover rounded text-text-secondary"
                  aria-label={tRuntime(
                    "runtimeGenerated.components.research.researchworkspaceview.attribute.archiveSession",
                  )}
                >
                  <span aria-hidden="true">
                    <ArchiveIcon />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteSession(activeSession.id)}
                  disabled={deletingSessionId === activeSession.id}
                  className="p-2 hover:bg-danger/15 rounded text-text-secondary hover:text-danger transition-colors"
                  aria-label={tRuntime(
                    "runtimeGenerated.components.research.researchworkspaceview.attribute.deleteSession",
                  )}
                >
                  <span aria-hidden="true">
                    <TrashIcon />
                  </span>
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 flex overflow-hidden">
                  {/* Left Column - Search & Sources */}
                  <div className="flex-1 flex flex-col border-r border-vf-panel-border overflow-hidden">
                    <div className="p-4 space-y-4 border-b border-vf-panel-border">
                      <form onSubmit={handleSearch} className="flex gap-2">
                        <label
                          htmlFor="research-search-query"
                          className="sr-only"
                        >
                          <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.label.searchQuery" />
                        </label>
                        <input
                          id="research-search-query"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={tRuntime(
                            "runtimeGenerated.components.research.researchworkspaceview.attribute.searchQuery",
                          )}
                          className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                        />
                        <button
                          type="submit"
                          disabled={isSearching}
                          aria-label={tRuntime(
                            "runtimeGenerated.components.research.researchworkspaceview.attribute.runResearchSearch",
                          )}
                          className="px-4 py-2 bg-vf-panel-bg-raised hover:bg-vf-control-hover-muted text-text-primary rounded text-sm disabled:opacity-50 transition-colors"
                        >
                          {isSearching ? "..." : <SearchIcon />}
                        </button>
                      </form>
                      <form onSubmit={handleScrape} className="flex gap-2">
                        <label
                          htmlFor="research-scrape-url"
                          className="sr-only"
                        >
                          <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.label.scrapeUrl" />
                        </label>
                        <input
                          id="research-scrape-url"
                          value={scrapeUrl}
                          onChange={(e) => setScrapeUrl(e.target.value)}
                          placeholder="Scrape URL (https://...)"
                          className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                        />
                        <button
                          type="submit"
                          disabled={isScraping}
                          aria-label={tRuntime(
                            "runtimeGenerated.components.research.researchworkspaceview.attribute.scrapeUrl",
                          )}
                          className="px-4 py-2 bg-vf-panel-bg-raised hover:bg-vf-control-hover-muted text-text-primary rounded text-sm disabled:opacity-50 transition-colors"
                        >
                          {isScraping ? "..." : <ScrapeIcon />}
                        </button>
                      </form>

                      <div className="flex justify-start">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          className="hidden"
                          multiple
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                          className="flex items-center gap-2 px-3 py-1.5 bg-vf-panel-bg-raised border border-vf-panel-border hover:bg-vf-control-hover-muted text-text-primary rounded text-xs disabled:opacity-50 transition-colors"
                        >
                          <UploadIcon />
                          {isUploading
                            ? tRuntime(
                                "runtimeGenerated.components.research.researchworkspaceview.text.processing",
                              )
                            : tRuntime(
                                "runtimeGenerated.components.research.researchworkspaceview.text.uploadDocument",
                              )}
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <h3 className="font-bold text-sm uppercase text-text-muted">
                        <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.heading.sources" />
                        {activeSession.sources.length})
                      </h3>
                      {activeSession.sources.map((src) => (
                        <div
                          key={src.id}
                          className="bg-vf-panel-bg-raised border border-vf-panel-border rounded p-3 relative group"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              removeSource(activeSession.id, src.id)
                            }
                            className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:text-danger text-text-muted transition-opacity"
                            aria-label={tRuntime(
                              "runtimeGenerated.components.research.researchworkspaceview.attribute.removeSourceValue1",
                              { value1: src.title },
                            )}
                          >
                            <span aria-hidden="true">
                              <TrashIcon />
                            </span>
                          </button>
                          <h4 className="font-bold text-accent truncate pr-6">
                            <SourceLink title={src.title} url={src.url} />
                          </h4>
                          <p className="text-xs text-text-muted truncate mb-2">
                            {src.url}
                          </p>
                          <div className="text-sm text-text-secondary line-clamp-3">
                            {src.excerpt ||
                              src.summary ||
                              tRuntime(
                                "runtimeGenerated.components.research.researchworkspaceview.text.noExcerptAvailable",
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Column - Findings */}
                  <div className="w-96 flex flex-col bg-vf-panel-bg overflow-hidden">
                    <div className="p-4 border-b border-vf-panel-border">
                      <h3 className="font-bold text-sm uppercase text-text-muted mb-4">
                        <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.heading.addFinding" />
                      </h3>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label
                            htmlFor="research-finding-title"
                            className="text-xs font-medium text-text-secondary"
                          >
                            <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.label.findingTitle" />
                          </label>
                          <input
                            id="research-finding-title"
                            value={findingTitle}
                            onChange={(e) => setFindingTitle(e.target.value)}
                            placeholder={tRuntime(
                              "runtimeGenerated.components.research.researchworkspaceview.attribute.summarizeTheFinding",
                            )}
                            className="w-full bg-vf-panel-bg border border-vf-panel-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="research-finding-content"
                            className="text-xs font-medium text-text-secondary"
                          >
                            <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.label.findingContent" />
                          </label>
                          <textarea
                            id="research-finding-content"
                            value={findingContent}
                            onChange={(e) => setFindingContent(e.target.value)}
                            placeholder={tRuntime(
                              "runtimeGenerated.components.research.researchworkspaceview.attribute.addSupportingDetailsAndCitations",
                            )}
                            rows={4}
                            className="w-full bg-vf-panel-bg border border-vf-panel-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none"
                          />
                        </div>
                        <button
                          onClick={handleAddFinding}
                          className="w-full py-2 bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow)] shadow-[0_0_8px_var(--color-vf-accent-glow)] rounded text-sm font-bold transition-colors"
                        >
                          <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.action.saveFinding" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <h3 className="font-bold text-sm uppercase text-text-muted">
                        <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.heading.findings" />
                        {activeSession.findings.length})
                      </h3>
                      {activeSession.findings.map((f) => (
                        <div
                          key={f.id}
                          className="bg-vf-panel-bg-raised border border-vf-panel-border rounded p-3 group"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-text-primary">
                              {f.title}
                            </h4>
                            <button
                              type="button"
                              onClick={() =>
                                removeFinding(activeSession.id, f.id)
                              }
                              className="p-1 opacity-0 group-hover:opacity-100 hover:text-danger text-text-muted transition-opacity"
                              aria-label={tRuntime(
                                "runtimeGenerated.components.research.researchworkspaceview.attribute.removeFindingValue1",
                                { value1: f.title },
                              )}
                            >
                              <span aria-hidden="true">
                                <TrashIcon />
                              </span>
                            </button>
                          </div>
                          <div className="text-sm text-text-secondary whitespace-pre-wrap">
                            {f.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted flex-col gap-4">
            <Meteocon name="compass" size={64} className="text-text-muted" />
            <p>
              <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.description.selectAResearchSessionOrCreateA" />
            </p>
            <button
              onClick={handleCreateSession}
              className="px-6 py-2 bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow)] shadow-[0_0_8px_var(--color-vf-accent-glow)] rounded font-bold transition-colors"
            >
              <Trans i18nKey="common:surface.componentsResearchResearchworkspaceview.action.newResearchSession" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
