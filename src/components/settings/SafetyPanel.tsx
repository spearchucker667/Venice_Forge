import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { MasterPasswordDialog } from "./MasterPasswordDialog";
import { useProfileStore } from "../../stores/profile-store";
import { isElectron } from "../../services/desktopBridge";

export interface SafetyPanelProps {
  localFamilySafeModeEnabled: boolean;
  veniceApiSafeMode: boolean;
  onUpdateSafetySetting: (
    key: "local_family_safe_mode_enabled" | "venice_api_safe_mode",
    enabled: boolean,
    masterPassword?: string
  ) => Promise<void> | void;
}

export function SafetyPanel({
  localFamilySafeModeEnabled,
  veniceApiSafeMode,
  onUpdateSafetySetting,
}: SafetyPanelProps): React.ReactElement {
  const isDesktop = isElectron();
  const { t: tRuntime } = useTranslation("common");
  const { t } = useTranslation(["settings", "common"]);
  const { masterPasswordSet } = useProfileStore();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    key: "local_family_safe_mode_enabled" | "venice_api_safe_mode";
    enabled: boolean;
  } | null>(null);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14.5px] font-medium text-text-primary">
                {t("settings:safety.familySafeModeTitle", "Family Safe Mode")}
              </h3>
              {!isDesktop && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-vf-panel-bg-inset text-text-muted border border-vf-panel-border">
                  {t("settings:safety.serverControlledBadge", "Server Controlled (Web Mode)")}
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
              {t(
                "settings:safety.familySafeModeDescription",
                "Controls local Family Safe Mode screening. When it is off, local screening is skipped; Venice API provider Safe Mode is controlled separately.",
              )}
            </p>
            {!isDesktop && (
              <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
                {t(
                  "settings:safety.webModeNotice",
                  "In Web Mode, local safety filtering is server-controlled by the operator policy (VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED). Use Electron desktop mode for owner-controlled local safety toggles.",
                )}
              </p>
            )}
          </div>
          <label className={`flex items-center gap-2 shrink-0 ${isDesktop ? "cursor-pointer" : "cursor-not-allowed opacity-80"}`}>
            <input
              type="checkbox"
              checked={localFamilySafeModeEnabled}
              disabled={!isDesktop}
              onChange={(event) => {
                if (!isDesktop) return;
                // Force a master password setup before any toggle is committed.
                // Without a master password, an attacker (or a curious sibling) who
                // sits down at the unlocked app can flip Family Safe Mode with
                // one click. Routing through the dialog also lets the dialog run
                // in "setup" mode the first time and "verify" mode afterwards.
                setPendingAction({
                  key: "local_family_safe_mode_enabled",
                  enabled: event.target.checked,
                });
                setShowPasswordDialog(true);
              }}
              className="h-4 w-4 rounded border-vf-panel-border bg-vf-panel-bg-inset text-accent"
            />
            <span className="text-[12.5px] font-medium text-text-primary">
              {localFamilySafeModeEnabled
                ? t("settings:safety.onFamilySafeMode", "ON: Family Safe Mode")
                : t(
                    "settings:safety.offAdultMode",
                    "OFF: Adult Mode (Local Filter OFF)",
                  )}
            </span>
          </label>
        </div>

        <p className="text-[12px] text-text-muted leading-relaxed">
          {localFamilySafeModeEnabled
            ? t(
                "settings:safety.status.enabled",
                "When enabled, matching requests are blocked locally before the provider is called.",
              )
            : t(
                "settings:safety.status.disabled",
                "Local Family Safe Mode screening is off; Venice API provider Safe Mode is controlled separately below.",
              )}
        </p>

        <div className="rounded-md bg-vf-panel-bg-inset p-3 border border-vf-panel-border text-[12px] space-y-1">
          <div className="font-medium text-text-primary">
            {t("settings:safety.effectiveStatus", {
              defaultValue:
                "Effective Status: Local filter: {{local}} | Venice provider filtering: {{provider}}",
              local: localFamilySafeModeEnabled ? "ON" : "OFF",
              provider: veniceApiSafeMode ? "ON" : "OFF",
            })}
          </div>
          <div className="text-text-muted">
            {!localFamilySafeModeEnabled && veniceApiSafeMode
              ? t(
                  "settings:safety.status.localOffProviderOn",
                  "Local family filter is OFF, but Venice API provider-side Safe Mode is still ON. Outbound requests include safe_mode: true.",
                )
              : !localFamilySafeModeEnabled && !veniceApiSafeMode
                ? t(
                    "settings:safety.status.bothOff",
                    "Both filters are OFF and outbound requests include safe_mode: false. Local screening is skipped.",
                  )
                : t(
                    "settings:safety.status.filteredLocally",
                    "Matching requests are filtered locally before reaching the provider.",
                  )}
          </div>
        </div>

        <div className="mt-2">
          {!masterPasswordSet ? (
            <button
              className="text-[12.5px] text-accent underline"
              onClick={() => {
                setPendingAction(null);
                setShowPasswordDialog(true);
              }}
            >
              {t(
                "settings:safety.setMasterPassword",
                "Set Master Password to lock Family Safe Mode",
              )}
            </button>
          ) : (
            <span className="text-[12.5px] text-success">
              {t(
                "settings:safety.masterPasswordEnabled",
                "Master Password is enabled",
              )}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14.5px] font-medium text-text-primary">
              {t(
                "settings:safety.veniceApiSafeModeTitle",
                "Venice API Safe Mode",
              )}
            </h3>
            <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
              {t(
                "settings:safety.veniceApiSafeModeDescription",
                "Controls the provider-side safemode parameter sent to Venice. This is separate from Family Safe Mode.",
              )}
            </p>
          </div>
          <input
            type="checkbox"
            aria-label={tRuntime(
              "runtimeGenerated.components.settings.safetypanel.attribute.veniceApiSafeMode",
            )}
            checked={veniceApiSafeMode}
            onChange={(event) => {
              onUpdateSafetySetting(
                "venice_api_safe_mode",
                event.target.checked,
              );
            }}
            className="h-4 w-4 rounded border-vf-panel-border bg-vf-panel-bg-inset text-accent cursor-pointer"
          />
        </div>
      </div>

      {showPasswordDialog && (
        <MasterPasswordDialog
          isOpen={showPasswordDialog}
          mode={masterPasswordSet ? "verify" : "setup"}
          onClose={() => setShowPasswordDialog(false)}
          onSuccess={(password) => {
            setShowPasswordDialog(false);
            if (pendingAction) {
              onUpdateSafetySetting(pendingAction.key, pendingAction.enabled, password);
              setPendingAction(null);
            }
          }}
        />
      )}
    </div>
  );
}
