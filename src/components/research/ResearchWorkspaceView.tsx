/** @fileoverview Research Workspace View (Phase 2I).
 *
 * This component provides the primary UI for managing research sessions,
 * running searches, scraping URLs, building findings, and generating summaries.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  useResearchStore 
} from '../../stores/research-store';
import { 
  useProjectStore 
} from '../../stores/project-store';
import {
  runResearchSearch,
  runResearchScrape,
} from '../../services/researchService';
import {
  buildResearchSummary,
} from '../../services/researchSummaries';
import { sanitizeResearchUrl } from '../../types/research';
import { usePromptLibraryStore } from '../../stores/prompt-library-store';
import { useWorkflowTemplateStore } from '../../stores/workflow-template-store';
import { toast } from '../../stores/toast-store';
import { askDecision, askText } from '../ui/modal-requests';
import { ResearchBrowserView } from './ResearchBrowserView';
import { researchBrowserBridge } from '../../services/researchBrowserBridge';
import { processFileAttachment } from '../../services/ingestion/attachmentAssembler';
import { redactErrorMessage } from '../../shared/redaction';

// Icons (mocking for now, will use existing if available)
const SearchIcon = () => <span>🔍</span>;
const ScrapeIcon = () => <span>🌐</span>;
const PlusIcon = () => <span>+</span>;
const TrashIcon = () => <span>🗑️</span>;
const ArchiveIcon = () => <span>📦</span>;
const StarIcon = ({ filled }: { filled: boolean }) => <span>{filled ? '⭐' : '☆'}</span>;
const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

function SourceLink({ title, url, onClick }: { title: string; url?: string; onClick?: (url: string) => void }) {
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

  const [searchQuery, setSearchQuery] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [findingTitle, setFindingTitle] = useState('');
  const [findingContent, setFindingContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Browser layout state
  const [browserWidth, setBrowserWidth] = useState(400);
  const [isDragging, setIsDragging] = useState(false);
  const leftColRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);
  const browserColRef = useRef<HTMLDivElement>(null);

  const updateBrowserWidthFromClientX = useCallback((clientX: number) => {
    const newWidth = document.body.clientWidth - clientX;
    setBrowserWidth(Math.max(300, Math.min(newWidth, 800)));
  }, []);

  const stopBrowserResizeDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (leftColRef.current) leftColRef.current.style.width = `calc(100% - ${browserWidth}px)`;
    if (browserColRef.current) browserColRef.current.style.width = `${browserWidth}px`;
  }, [browserWidth]);

  useEffect(() => {
    if (resizerRef.current) {
      resizerRef.current.style.backgroundColor = isDragging ? 'var(--accent)' : 'var(--border)';
    }
  }, [isDragging]);

  useEffect(() => {
    ensureResearchLoaded();
  }, [ensureResearchLoaded]);

  useEffect(() => {
    if (!isDragging) return undefined;

    const handleMouseMove = (event: MouseEvent) => {
      updateBrowserWidthFromClientX(event.clientX);
    };
    const handleMouseUp = () => {
      stopBrowserResizeDrag();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, stopBrowserResizeDrag, updateBrowserWidthFromClientX]);

  const handleOpenInBrowser = async (url: string) => {
    await researchBrowserBridge.navigate({ urlOrQuery: url });
  };

  const handleCaptureWithJina = async (url: string) => {
    if (!activeSession) return;
    setIsScraping(true);
    try {
      const result = await runResearchScrape({
        url,
        provider: 'jina',
        jinaOptions: { 'x-return-format': 'markdown' },
      });
      for (const source of result.sources) {
        await addSource(activeSession.id, source);
      }
      toast.success('Captured page with Jina Reader');
    } catch {
      toast.error('Jina capture failed');
    } finally {
      setIsScraping(false);
    }
  };

  const activeSession = useMemo(() => 
    sessions.find(s => s.id === activeSessionId) || null
  , [sessions, activeSessionId]);

  const filteredSessions = useMemo(() => {
    if (activeProjectId === null) return sessions;
    return sessions.filter(s => s.scope === 'global' || s.projectId === activeProjectId);
  }, [sessions, activeProjectId]);

  const handleCreateSession = async () => {
    const title = (await askText({
      title: 'Research title',
      initialValue: 'New Research',
      actionLabel: 'Create',
      validate: (value) => value.trim() ? null : 'Enter a title.',
    }))?.trim();
    if (title) await createSession({ title });
  };

  const handleDeleteSession = async (sessionId: string) => {
    const shouldDelete = await askDecision({
      title: 'Delete session?',
      detail: 'This removes the research session.',
      actionLabel: 'Delete',
      danger: true,
    });
    if (shouldDelete) void deleteSession(sessionId);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const result = await runResearchSearch({ 
        query: searchQuery, 
        provider: 'venice' 
      });
      
      await addQuery(activeSession.id, searchQuery);
      for (const source of result.sources) {
        await addSource(activeSession.id, source);
      }
      
      if (result.warnings.length > 0) {
        toast.warn(`Search finished with ${result.warnings.length} warnings`);
      }
      setSearchQuery('');
    } catch {
      toast.error('Search failed');
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
        provider: 'generic-http' 
      });
      
      for (const source of result.sources) {
        await addSource(activeSession.id, source);
      }
      
      if (result.warnings.length > 0) {
        toast.warn(result.warnings[0].message);
      }
      setScrapeUrl('');
    } catch {
      toast.error('Scrape failed');
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
        const textContent = attachment.text || '';
        await addSource(activeSession.id, {
          kind: 'manual_note',
          title: attachment.name,
          summary: textContent,
          excerpt: textContent.substring(0, 200) + (textContent.length > 200 ? '...' : ''),
          provider: 'manual',
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
          attachment.extraction.warnings.forEach(w => toast.warn('Attachment note', w));
        }
      }
      toast.success('File(s) added to research sources');
    } catch (err) {
      toast.error('File upload failed', redactErrorMessage(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddFinding = async () => {
    if (!activeSession || !findingTitle.trim() || !findingContent.trim()) return;
    
    await addFinding(activeSession.id, {
      title: findingTitle,
      content: findingContent,
      sourceIds: [],
      citationIds: [],
      tags: [],
    });
    
    setFindingTitle('');
    setFindingContent('');
  };

  const handleSaveToLibrary = async () => {
    if (!activeSession) return;
    const result = buildResearchSummary({ session: activeSession });
    await createPrompt({
      title: result.title,
      content: result.summary,
      kind: 'research',
      scope: activeSession.scope === 'project' ? 'project' : 'global',
      projectId: activeSession.projectId,
      tags: ['research', ...activeSession.tags],
    });
    toast.success('Summary saved to Prompt Library');
  };

  const handleCreateWorkflow = async () => {
    if (!activeSession) return;
    const result = buildResearchSummary({ session: activeSession });
    await createWorkflow({
      title: `Workflow: ${result.title}`,
      description: `Workflow generated from research session "${activeSession.title}"`,
      steps: [
        {
          id: crypto.randomUUID(),
          title: 'Review Research Summary',
          kind: 'handoff',
          target: 'chat',
          enabled: true,
          order: 0,
          input: { prompt: result.summary },
        }
      ],
      scope: activeSession.scope === 'project' ? 'project' : 'global',
      projectId: activeSession.projectId,
      tags: ['research', ...activeSession.tags],
      source: {
        type: 'research',
        sourceId: activeSession.id,
      },
    });
    toast.success('Research workflow created');
  };

  return (
    <div className="flex h-full bg-bg text-text-primary overflow-hidden">
      {/* Sidebar - Session List */}
      <div className="w-64 flex-shrink-0 border-r border-border/50 flex flex-col bg-surface">
        <div className="p-4 border-b border-border/50 flex justify-between items-center">
          <h2 className="font-bold text-text-primary">Research</h2>
          <button
            type="button"
            onClick={handleCreateSession}
            className="p-1 hover:bg-surface-elevated rounded text-text-secondary"
            aria-label="Create research session"
          >
            <span aria-hidden="true"><PlusIcon /></span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.map(s => (
            <div 
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={`p-3 cursor-pointer border-b border-border/50 transition-colors hover:bg-surface-elevated ${activeSessionId === s.id ? 'bg-surface-elevated border-l-4 border-l-accent' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="truncate font-medium text-text-primary">{s.title}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                  className="text-text-muted hover:text-text-primary"
                  aria-label={s.favorite ? `Remove ${s.title} from favorites` : `Add ${s.title} to favorites`}
                >
                  <span aria-hidden="true"><StarIcon filled={s.favorite} /></span>
                </button>
              </div>
              <div className="text-xs text-text-muted mt-1">
                {s.sources.length} sources • {s.findings.length} findings
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeSession ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border/50 flex justify-between items-center bg-surface-elevated">
              <div>
                <h1 className="text-xl font-bold text-text-primary">{activeSession.title}</h1>
                <p className="text-xs text-text-muted">{activeSession.scope} research</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateWorkflow} className="px-3 py-1 bg-surface border border-border hover:bg-surface-elevated text-text-primary rounded text-sm transition-colors">
                  Create Workflow
                </button>
                <button onClick={handleSaveToLibrary} className="px-3 py-1 bg-accent text-accent-fg hover:bg-accent-hover rounded text-sm transition-colors">
                  Save Summary
                </button>
                <button
                  type="button"
                  onClick={() => archiveSession(activeSession.id)}
                  className="p-2 hover:bg-surface-elevated rounded text-text-secondary"
                  aria-label="Archive session"
                >
                  <span aria-hidden="true"><ArchiveIcon /></span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteSession(activeSession.id)}
                  className="p-2 hover:bg-danger/15 rounded text-text-secondary hover:text-danger transition-colors"
                  aria-label="Delete session"
                >
                  <span aria-hidden="true"><TrashIcon /></span>
                </button>
              </div>
            </div>

            <div 
              className="flex-1 flex overflow-hidden relative"
            >
              <div 
                ref={leftColRef}
                className={`flex-1 flex flex-col overflow-hidden ${isDragging ? 'pointer-events-none select-none' : ''}`}
              >
                <div className="flex-1 flex overflow-hidden">
                  {/* Left Column - Search & Sources */}
                  <div className="flex-1 flex flex-col border-r border-border/50 overflow-hidden">
                <div className="p-4 space-y-4 border-b border-border/50">
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <label htmlFor="research-search-query" className="sr-only">Search query</label>
                    <input 
                      id="research-search-query"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search query..."
                      className="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                    />
                    <button 
                      type="submit"
                      disabled={isSearching}
                      aria-label="Run research search"
                      className="px-4 py-2 bg-surface-elevated hover:bg-surface-muted text-text-primary rounded text-sm disabled:opacity-50 transition-colors"
                    >
                      {isSearching ? '...' : <SearchIcon />}
                    </button>
                  </form>
                  <form onSubmit={handleScrape} className="flex gap-2">
                    <label htmlFor="research-scrape-url" className="sr-only">Scrape URL</label>
                    <input 
                      id="research-scrape-url"
                      value={scrapeUrl}
                      onChange={e => setScrapeUrl(e.target.value)}
                      placeholder="Scrape URL (https://...)"
                      className="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                    />
                    <button 
                      type="submit"
                      disabled={isScraping}
                      aria-label="Scrape URL"
                      className="px-4 py-2 bg-surface-elevated hover:bg-surface-muted text-text-primary rounded text-sm disabled:opacity-50 transition-colors"
                    >
                      {isScraping ? '...' : <ScrapeIcon />}
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
                      className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated border border-border hover:bg-surface-muted text-text-primary rounded text-xs disabled:opacity-50 transition-colors"
                    >
                      <UploadIcon />
                      {isUploading ? 'Processing...' : 'Upload Document'}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <h3 className="font-bold text-sm uppercase text-text-muted">Sources ({activeSession.sources.length})</h3>
                  {activeSession.sources.map(src => (
                    <div key={src.id} className="bg-surface-elevated border border-border rounded p-3 relative group">
                      <button
                        type="button"
                        onClick={() => removeSource(activeSession.id, src.id)}
                        className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:text-danger text-text-muted transition-opacity"
                        aria-label={`Remove source ${src.title}`}
                      >
                        <span aria-hidden="true"><TrashIcon /></span>
                      </button>
                      <h4 className="font-bold text-accent truncate pr-6">
                        <SourceLink title={src.title} url={src.url} onClick={handleOpenInBrowser} />
                      </h4>
                      <p className="text-xs text-text-muted truncate mb-2">{src.url}</p>
                      <div className="text-sm text-text-secondary line-clamp-3">
                        {src.excerpt || src.summary || 'No excerpt available.'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column - Findings */}
              <div className="w-96 flex flex-col bg-surface overflow-hidden">
                <div className="p-4 border-b border-border/50">
                  <h3 className="font-bold text-sm uppercase text-text-muted mb-4">Add Finding</h3>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="research-finding-title" className="text-xs font-medium text-text-secondary">
                        Finding title
                      </label>
                      <input
                        id="research-finding-title"
                        value={findingTitle}
                        onChange={e => setFindingTitle(e.target.value)}
                        placeholder="Summarize the finding"
                        className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="research-finding-content" className="text-xs font-medium text-text-secondary">
                        Finding content
                      </label>
                      <textarea
                        id="research-finding-content"
                        value={findingContent}
                        onChange={e => setFindingContent(e.target.value)}
                        placeholder="Add supporting details and citations"
                        rows={4}
                        className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none"
                      />
                    </div>
                    <button 
                      onClick={handleAddFinding}
                      className="w-full py-2 bg-accent text-accent-fg hover:bg-accent-hover rounded text-sm font-bold transition-colors"
                    >
                      Save Finding
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <h3 className="font-bold text-sm uppercase text-text-muted">Findings ({activeSession.findings.length})</h3>
                  {activeSession.findings.map(f => (
                    <div key={f.id} className="bg-surface-elevated border border-border rounded p-3 group">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-text-primary">{f.title}</h4>
                        <button
                          type="button"
                          onClick={() => removeFinding(activeSession.id, f.id)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-danger text-text-muted transition-opacity"
                          aria-label={`Remove finding ${f.title}`}
                        >
                          <span aria-hidden="true"><TrashIcon /></span>
                        </button>
                      </div>
                      <div className="text-sm text-text-secondary whitespace-pre-wrap">{f.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

              {/* Resizer */}
              <div 
                ref={resizerRef}
                className="w-1 cursor-col-resize hover:bg-accent transition-colors shrink-0"
                role="separator"
                aria-label="Resize research browser"
                aria-orientation="vertical"
                onMouseDown={(e) => {
                  e.preventDefault();
                  updateBrowserWidthFromClientX(e.clientX);
                  setIsDragging(true);
                }}
              />

              {/* Research Browser Column */}
              <div 
                ref={browserColRef}
                className={`flex flex-col h-full bg-bg shrink-0 ${isDragging ? 'pointer-events-none select-none' : ''}`}
              >
                <ResearchBrowserView onCaptureWithJina={handleCaptureWithJina} />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted flex-col gap-4">
            <div className="text-64px text-text-muted">🔬</div>
            <p>Select a research session or create a new one to begin.</p>
            <button 
              onClick={handleCreateSession}
              className="px-6 py-2 bg-accent text-accent-fg hover:bg-accent-hover rounded font-bold transition-colors"
            >
              New Research Session
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
