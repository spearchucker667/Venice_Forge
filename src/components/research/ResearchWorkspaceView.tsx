/** @fileoverview Research Workspace View (Phase 2I).
 *
 * This component provides the primary UI for managing research sessions,
 * running searches, scraping URLs, building findings, and generating summaries.
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import { usePromptLibraryStore } from '../../stores/prompt-library-store';
import { useWorkflowTemplateStore } from '../../stores/workflow-template-store';
import { toast } from '../../stores/toast-store';

// Icons (mocking for now, will use existing if available)
const SearchIcon = () => <span>🔍</span>;
const ScrapeIcon = () => <span>🌐</span>;
const PlusIcon = () => <span>+</span>;
const TrashIcon = () => <span>🗑️</span>;
const ArchiveIcon = () => <span>📦</span>;
const StarIcon = ({ filled }: { filled: boolean }) => <span>{filled ? '⭐' : '☆'}</span>;

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
  const [findingTitle, setFindingTitle] = useState('');
  const [findingContent, setFindingContent] = useState('');

  useEffect(() => {
    ensureResearchLoaded();
  }, [ensureResearchLoaded]);

  const activeSession = useMemo(() => 
    sessions.find(s => s.id === activeSessionId) || null
  , [sessions, activeSessionId]);

  const filteredSessions = useMemo(() => {
    if (activeProjectId === null) return sessions;
    return sessions.filter(s => s.scope === 'global' || s.projectId === activeProjectId);
  }, [sessions, activeProjectId]);

  const handleCreateSession = async () => {
    const title = prompt('Research Title', 'New Research');
    if (title) {
      await createSession({ title });
    }
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
    <div className="flex h-full bg-bg-base text-text-primary overflow-hidden">
      {/* Sidebar - Session List */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-surface">
        <div className="p-4 border-b border-border flex justify-between items-center">
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
              className={`p-3 cursor-pointer border-b border-border transition-colors hover:bg-surface-elevated ${activeSessionId === s.id ? 'bg-surface-elevated border-l-4 border-l-accent' : ''}`}
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
            <div className="p-4 border-b border-border flex justify-between items-center bg-surface-elevated">
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
                  onClick={() => { if(confirm('Delete session?')) deleteSession(activeSession.id); }}
                  className="p-2 hover:bg-danger/15 rounded text-text-secondary hover:text-danger transition-colors"
                  aria-label="Delete session"
                >
                  <span aria-hidden="true"><TrashIcon /></span>
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left Column - Search & Sources */}
              <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
                <div className="p-4 space-y-4 border-b border-border">
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <label htmlFor="research-search-query" className="sr-only">Search query</label>
                    <input 
                      id="research-search-query"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search query..."
                      className="flex-1 bg-bg-base border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
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
                      className="flex-1 bg-bg-base border border-border rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
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
                        <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">{src.title}</a>
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
                <div className="p-4 border-b border-border">
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
                        className="w-full bg-bg-base border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
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
                        className="w-full bg-bg-base border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none"
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
