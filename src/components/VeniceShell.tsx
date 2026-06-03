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
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <VeniceSidebar state={state} dispatch={dispatch} />
      
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 flex h-14 shrink-0 items-center border-b border-border/35 bg-bg px-6">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5 lg:hidden">
              <img
                src="./assets/branding/venice-keys-red.svg"
                alt="Venice"
                title="Venice keys mark \u2014 used for API compatibility identification. Venice Forge is unofficial."
                className="h-8 w-8 shrink-0"
                style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
              />
              <div className="hidden sm:block">
                <div className="whitespace-nowrap font-display text-lg font-bold text-text-primary">
                  Venice Forge
                </div>
              </div>
            </div>
            
            <div className="flex w-full items-center justify-end gap-3 lg:w-auto">
              {isElectron() ? (
                <Chip tone={apiKeyConfigured ? "ok" : "warn"} className="hidden md:inline-flex">
                  {apiKeyConfigured ? "API key set" : "No API key"}
                </Chip>
              ) : (
                <Chip tone="ok" className="hidden md:inline-flex">Proxy Active</Chip>
              )}
              <Chip tone={state.usingFallbackModels ? "warn" : "ok"} className="hidden md:inline-flex">
                {state.usingFallbackModels ? "Fallback models" : "Live Models"}
              </Chip>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-transparent bg-transparent px-4 text-sm font-medium text-text-primary transition-colors duration-150 hover:border-border hover:bg-surface-elevated"
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
