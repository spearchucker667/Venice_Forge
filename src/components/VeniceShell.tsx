import React from "react";
import { AppState, AppDispatch } from "../types/app";
import { VeniceSidebar } from "./VeniceSidebar";
import { Chip } from "./Chip";

import { isElectron } from "../services/desktopBridge";

interface VeniceShellProps {
  state: AppState;
  dispatch: AppDispatch;
  apiKeyConfigured: boolean | null;
  children: React.ReactNode;
}

export function VeniceShell({ state, dispatch, apiKeyConfigured, children }: VeniceShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <VeniceSidebar state={state} dispatch={dispatch} />
      
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header 
          className="relative z-20 flex h-14 shrink-0 items-center px-6 transition-colors"
          style={{ 
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)'
          }}
        >
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <img
                src="./assets/branding/venice-keys-red.svg"
                alt="Venice"
                title="Venice keys mark — used for API compatibility identification. Venice Forge is unofficial."
                className="h-8 w-8 shrink-0"
                style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
              />
              <div className="hidden sm:block">
                <div 
                  className="whitespace-nowrap text-lg font-bold"
                  style={{ fontFamily: 'var(--display)', color: 'var(--text-primary)' }}
                >
                  Venice Forge
                </div>
              </div>
            </div>
            
            <div className="flex w-full items-center justify-end gap-3 lg:w-auto">
              {isElectron() ? (
                <Chip 
                  tone={apiKeyConfigured ? "ok" : "warn"}
                  className="hidden md:inline-flex"
                  style={{ 
                    background: apiKeyConfigured ? 'var(--accent-soft)' : 'rgba(212, 168, 67, 0.12)',
                    color: apiKeyConfigured ? 'var(--accent)' : 'var(--warning)',
                    border: '1px solid transparent'
                  }}
                >
                  {apiKeyConfigured ? "API key set" : "No API key"}
                </Chip>
              ) : (
                <Chip 
                  tone="ok" 
                  className="hidden md:inline-flex"
                  style={{ 
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    border: '1px solid transparent'
                  }}
                >
                  Proxy Active
                </Chip>
              )}
              <Chip 
                tone={state.usingFallbackModels ? "warn" : "ok"}
                className="hidden md:inline-flex"
                style={{ 
                  background: state.usingFallbackModels ? 'rgba(212, 168, 67, 0.12)' : 'var(--accent-soft)',
                  color: state.usingFallbackModels ? 'var(--warning)' : 'var(--accent)',
                  border: '1px solid transparent'
                }}
              >
                {state.usingFallbackModels ? "Fallback models" : "Live Models"}
              </Chip>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-all duration-150"
                style={{ 
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--border)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-elevated)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
                onClick={() => dispatch({ type: "SET_TAB", tab: "diagnostics" })}
                title="System Status"
              >
                Status
              </button>
            </div>
          </div>
        </header>
        
        {children}
      </div>
    </div>
  );
}