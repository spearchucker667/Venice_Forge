import React from "react";

export interface SafetyPanelProps {
  localFamilySafeModeEnabled: boolean;
  veniceApiSafeMode: boolean;
  onUpdateSafetySetting: (
    key: "local_family_safe_mode_enabled" | "venice_api_safe_mode",
    enabled: boolean,
  ) => Promise<void> | void;
}

export function SafetyPanel({
  localFamilySafeModeEnabled,
  veniceApiSafeMode,
  onUpdateSafetySetting,
}: SafetyPanelProps): React.ReactElement {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14.5px] font-medium text-text-primary">Family Safe Mode</h3>
            <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
              Runs Venice Forge&apos;s local family-safe filter before sending requests. Designed for child/family-safe use.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={localFamilySafeModeEnabled}
              onChange={(event) => void onUpdateSafetySetting("local_family_safe_mode_enabled", event.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface text-accent"
            />
            <span className="text-[12.5px] font-medium text-text-primary">
              {localFamilySafeModeEnabled ? "ON: Family Safe Mode" : "OFF: Adult Mode"}
            </span>
          </label>
        </div>
        <p className="text-[12px] text-text-muted leading-relaxed">
          {localFamilySafeModeEnabled
            ? "When enabled, matching requests are blocked locally before the provider is called."
            : "Bypasses Venice Forge's local family-safe filter. Venice/API-level safety and provider-side safemode are controlled separately."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14.5px] font-medium text-text-primary">Venice API Safe Mode</h3>
            <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
              Controls the provider-side safemode parameter sent to Venice. This is separate from Family Safe Mode.
            </p>
          </div>
          <input
            type="checkbox"
            aria-label="Venice API Safe Mode"
            checked={veniceApiSafeMode}
            onChange={(event) => void onUpdateSafetySetting("venice_api_safe_mode", event.target.checked)}
            className="h-4 w-4 rounded border-border bg-surface text-accent cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
