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
    <div className="flex h-full bg-slate-900 text-slate-100 overflow-hidden">
      {/* Sidebar - Session List */}
      <div className="w-64 flex-shrink-0 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="font-bold">Research</h2>
          <button onClick={handleCreateSession} className="p-1 hover:bg-slate-700 rounded">
            <PlusIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.map(s => (
            <div 
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={`p-3 cursor-pointer border-b border-slate-800 hover:bg-slate-800 transition-colors ${activeSessionId === s.id ? 'bg-slate-800 border-l-4 border-l-blue-500' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="truncate font-medium">{s.title}</span>
                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}>
                  <StarIcon filled={s.favorite} />
                </button>
              </div>
              <div className="text-xs text-slate-400 mt-1">
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
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
              <div>
                <h1 className="text-xl font-bold">{activeSession.title}</h1>
                <p className="text-xs text-slate-400">{activeSession.scope} research</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateWorkflow} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm">
                  Create Workflow
                </button>
                <button onClick={handleSaveToLibrary} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">
                  Save Summary
                </button>
                <button onClick={() => archiveSession(activeSession.id)} className="p-2 hover:bg-slate-700 rounded" title="Archive">
                  <ArchiveIcon />
                </button>
                <button onClick={() => { if(confirm('Delete session?')) deleteSession(activeSession.id); }} className="p-2 hover:bg-red-900 rounded" title="Delete">
                  <TrashIcon />
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left Column - Search & Sources */}
              <div className="flex-1 flex flex-col border-r border-slate-700 overflow-hidden">
                <div className="p-4 space-y-4 border-b border-slate-700">
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <input 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search query..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      disabled={isSearching}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-50"
                    >
                      {isSearching ? '...' : <SearchIcon />}
                    </button>
                  </form>
                  <form onSubmit={handleScrape} className="flex gap-2">
                    <input 
                      value={scrapeUrl}
                      onChange={e => setScrapeUrl(e.target.value)}
                      placeholder="Scrape URL (https://...)"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      disabled={isScraping}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-50"
                    >
                      {isScraping ? '...' : <ScrapeIcon />}
                    </button>
                  </form>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <h3 className="font-bold text-sm uppercase text-slate-500">Sources ({activeSession.sources.length})</h3>
                  {activeSession.sources.map(src => (
                    <div key={src.id} className="bg-slate-800 border border-slate-700 rounded p-3 relative group">
                      <button 
                        onClick={() => removeSource(activeSession.id, src.id)}
                        className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                      >
                        <TrashIcon />
                      </button>
                      <h4 className="font-bold text-blue-400 truncate pr-6">
                        <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">{src.title}</a>
                      </h4>
                      <p className="text-xs text-slate-400 truncate mb-2">{src.url}</p>
                      <div className="text-sm text-slate-300 line-clamp-3">
                        {src.excerpt || src.summary || 'No excerpt available.'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column - Findings */}
              <div className="w-96 flex flex-col bg-slate-800/50 overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                  <h3 className="font-bold text-sm uppercase text-slate-500 mb-4">Add Finding</h3>
                  <div className="space-y-3">
                    <input 
                      value={findingTitle}
                      onChange={e => setFindingTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
                    />
                    <textarea 
                      value={findingContent}
                      onChange={e => setFindingContent(e.target.value)}
                      placeholder="Content / Insight"
                      rows={4}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm resize-none"
                    />
                    <button 
                      onClick={handleAddFinding}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold"
                    >
                      Save Finding
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <h3 className="font-bold text-sm uppercase text-slate-500">Findings ({activeSession.findings.length})</h3>
                  {activeSession.findings.map(f => (
                    <div key={f.id} className="bg-slate-800 border border-slate-700 rounded p-3 group">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold">{f.title}</h4>
                        <button 
                          onClick={() => removeFinding(activeSession.id, f.id)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-400"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="text-sm text-slate-300 whitespace-pre-wrap">{f.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-4">
            <div className="text-64px">🔬</div>
            <p>Select a research session or create a new one to begin.</p>
            <button 
              onClick={handleCreateSession}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold"
            >
              New Research Session
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
