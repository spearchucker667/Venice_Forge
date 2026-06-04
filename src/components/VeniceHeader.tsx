import React from "react";
import { ModelSelect } from "./ModelSelect";
import { ModelInfo } from "../types/venice";

interface VeniceHeaderProps {
  activeTabLabel: string;
  activeTabSubtitle: string;
  showModelSelector: boolean;
  modelType: string;
  currentModel: string;
  models: { text: ModelInfo[]; image: ModelInfo[]; video: ModelInfo[] };
  onModelChange: (model: string) => void;
  apiKeyConfigured: boolean | null;
  onOpenApiKey: () => void;
  onOpenMobileSidebar: () => void;
}

export function VeniceHeader({
  activeTabLabel,
  activeTabSubtitle,
  showModelSelector,
  modelType,
  currentModel,
  models,
  onModelChange,
  apiKeyConfigured,
  onOpenApiKey,
  onOpenMobileSidebar,
}: VeniceHeaderProps) {
  const modelList = modelType === 'text' ? models.text :
                    modelType === 'image' ? models.image :
                    modelType === 'video' ? models.video : [];

  return (
    <header
      className="flex items-center gap-3 h-14 px-3 shrink-0"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)'
      }}
    >
      <button
        onClick={onOpenMobileSidebar}
        aria-label="Open menu"
        className="md:hidden p-1.5 -ml-1 rounded-md transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <div className="flex flex-col min-w-0">
        <span className="text-[14px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
          {activeTabLabel}
        </span>
        <span
          className="text-[11px] mt-0.5 leading-none hidden sm:block truncate"
          style={{ color: 'var(--text-muted)' }}
        >
          {activeTabSubtitle}
        </span>
      </div>

{showModelSelector && (
        <>
          <div className="w-px h-5 hidden sm:block" style={{ background: 'var(--border)' }} aria-hidden />
          <div className="w-44 sm:w-64">
            <ModelSelect
              value={currentModel}
              models={modelList}
              onChange={onModelChange}
            />
          </div>
        </>
      )}

      <div className="flex-1" />

      <button
        onClick={onOpenApiKey}
        aria-label={apiKeyConfigured ? 'API key connected, manage' : 'Connect API key'}
        className="flex items-center gap-2 text-[13px] px-2.5 py-1.5 rounded-md border transition-colors"
        style={{
          borderColor: apiKeyConfigured ? 'var(--border)' : 'var(--accent-soft)',
          color: apiKeyConfigured ? 'var(--text-secondary)' : 'var(--text-muted)',
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          if (apiKeyConfigured) {
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          } else {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }
        }}
        onMouseLeave={(e) => {
          if (apiKeyConfigured) {
            e.currentTarget.style.borderColor = 'var(--border)';
          } else {
            e.currentTarget.style.borderColor = 'var(--accent-soft)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }
        }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: apiKeyConfigured ? 'var(--accent)' : 'var(--text-muted)',
            animation: !apiKeyConfigured ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
          }}
        />
        <span className={apiKeyConfigured ? 'font-medium' : ''}>
          {apiKeyConfigured ? 'Connected' : 'Connect API key'}
        </span>
      </button>
    </header>
  );
}