import React from "react";
import { AppState, AppDispatch } from "../types/app";
import { TABS } from "../constants/venice";
import { TabButton } from "./TabButton";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SparklesIcon } from "./icons";
import { isElectron } from "../services/desktopBridge";

interface VeniceSidebarProps {
  state: AppState;
  dispatch: AppDispatch;
}

export function VeniceSidebar({ state, dispatch }: VeniceSidebarProps) {
  return (
    <>
      {/* Desktop Sidebar (Full Height Left Rail) */}
      <aside
        className={`hidden h-screen flex-col justify-between bg-bg p-3 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:flex ${
          state.sidebarCollapsed ? "w-20 min-w-[80px] items-center px-2" : "w-[260px] min-w-[260px]"
        }`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            {!state.sidebarCollapsed && (
              <div className="px-2">
                <img
                  src="./assets/branding/venice-logo-lockup-red.svg"
                  alt="Venice Forge"
                  title="Venice Forge \u2014 unofficial third-party client for the Venice API"
                  className="h-7 w-auto"
                  style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
                />
              </div>
            )}
            {state.sidebarCollapsed && (
              <div className="flex justify-center">
                <img
                  src="./assets/branding/venice-keys-red.svg"
                  alt="Venice"
                  title="Venice keys mark \u2014 used for API compatibility identification. Venice Forge is unofficial."
                  className="h-10 w-10"
                  style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
                />
              </div>
            )}
            <button
              onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
              title={state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {state.sidebarCollapsed ? <PanelLeftOpenIcon size={16} /> : <PanelLeftCloseIcon size={16} />}
            </button>
          </div>

          {!state.sidebarCollapsed && (
            <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-surface-elevated text-accent">
                <SparklesIcon size={16} />
              </div>
              <span className="text-xs font-semibold text-text-secondary">Venice Forge</span>
            </div>
          )}

          <nav className={`flex flex-col gap-1 ${state.sidebarCollapsed ? "items-center" : ""}`}>
            {TABS.map(([id, label]) => (
              <TabButton
                key={id}
                id={id}
                label={label}
                active={state.activeTab === id}
                onClick={(tab) => dispatch({ type: "SET_TAB", tab })}
                iconOnly={state.sidebarCollapsed}
                className={state.sidebarCollapsed ? "h-16 w-16 !p-2" : ""}
              />
            ))}
          </nav>
        </div>

        <div className={`rounded-lg border border-border/40 bg-surface space-y-2 ${state.sidebarCollapsed ? "p-2 flex flex-col items-center gap-2" : "p-3"}`}>
          {!state.sidebarCollapsed && (
            <>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">System</div>
                <div className="mt-1 text-xs text-text-secondary">{isElectron() ? "IPC Transport" : "Proxy Active"}</div>
              </div>
              <div className="border-t border-border/50 pt-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-warning leading-tight">
                  Unofficial client
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted leading-tight">
                  Not affiliated with Venice.ai
                </div>
              </div>
            </>
          )}
          {state.sidebarCollapsed && (
            <>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface-elevated text-text-muted" title={isElectron() ? "IPC Transport" : "Proxy Active"}>
                <span className="text-xs">{isElectron() ? "🖥" : "🌐"}</span>
              </div>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-warning/10 text-warning" title="Unofficial client \u2014 not affiliated with Venice.ai">
                <span className="text-xs">⚠</span>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Mobile Nav Rail (tablet width) */}
      <nav className="hidden h-screen w-20 min-w-[80px] flex-col items-center gap-3 bg-bg py-4 md:flex lg:hidden overflow-y-auto">
        <div className="mb-2 px-2">
          <img
            src="./assets/branding/venice-keys-red.svg"
            alt="Venice"
            title="Venice keys mark \u2014 used for API compatibility identification. Venice Forge is unofficial."
            className="h-8 w-8"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
          />
        </div>
        {TABS.map(([id, label]) => (
          <TabButton
            key={id}
            id={id}
            label={label}
            active={state.activeTab === id}
            onClick={(tab) => dispatch({ type: "SET_TAB", tab })}
            className="h-16 w-16 !p-2"
            iconOnly
          />
        ))}
      </nav>
    </>
  );
}
