/** @fileoverview Phase 2C header status cluster.
 *
 * Renders the compact status cluster that lives in the main app
 * header. Each indicator is a clickable chip that opens the
 * diagnostics drawer focused on its category. The cluster is mounted
 * on every main tab; it subscribes to the `useStatusStore` snapshot
 * so severity updates propagate without prop-drilling.
 *
 * Keyboard / a11y:
 *   - Each indicator is a `<button type="button">` with an aria-label
 *     that combines the category label + severity word.
 *   - Enter / Space activate the focused indicator and open the drawer.
 *   - The cluster is wrapped in a `role="group"` with an aria-label.
 *   - Tooltips surface the one-sentence summary on hover.
 *
 * Responsive behavior:
 *   - On narrow layouts the labels collapse to a single short word
 *     (severity-only) and the chips wrap.
 *   - The cluster is rendered with `min-w-0` so it never crowds the
 *     sidebar or the model selector.
 */

import { useEffect, useMemo } from "react";
import { useStatusStore } from "../../stores/status-store";
import { useSettingsStore } from "../../stores/settings-store";
import {
  StatusIndicator,
} from "./StatusIndicator";
import type { AppStatusItem, AppStatusSnapshot } from "../../types/status";
import { isElectron } from "../../services/desktopBridge";

/** Ordered list of categories shown in the cluster. The order is
 *  stable so the user can build muscle memory for the location. */
const CLUSTER_ORDER: Array<{ key: keyof AppStatusSnapshot; label: string }> = [
  { key: "api", label: "API" },
  { key: "apiKey", label: "Key" },
  { key: "model", label: "Model" },
  { key: "storage", label: "Storage" },
  { key: "safety", label: "Safety" },
  { key: "provider", label: "Research" },
  { key: "project", label: "Project" },
  { key: "desktop", label: "Mode" },
];

export interface HeaderStatusClusterProps {
  /** Optional override for tests. */
  status?: AppStatusSnapshot;
  /** Compact mode is auto-derived on narrow viewports but tests
   *  force it explicitly. */
  compact?: boolean;
}

export function HeaderStatusCluster({ status: statusOverride, compact = false }: HeaderStatusClusterProps) {
  const status = useStatusStore((s) => s.status)
  const openDrawer = useStatusStore((s) => s.openDrawer)
  const recompute = useStatusStore((s) => s.recompute)

  // Recompute the snapshot whenever the active tab changes so a
  // user who navigates from Media Studio to Status sees fresh state.
  const activeTab = useSettingsStore((s) => s.activeTab)
  useEffect(() => {
    recompute()
  }, [activeTab, recompute])

  const snapshot = statusOverride ?? status
  const items = useMemo(() => {
    return CLUSTER_ORDER.map(({ key, label }) => {
      const it: AppStatusItem = snapshot[key]
      return { key, label, item: it }
    })
  }, [snapshot])

  return (
    <div
      role="group"
      aria-label="App status cluster"
      data-testid="header-status-cluster"
      data-app-mode={isElectron() ? "desktop" : "web"}
      className="flex flex-wrap items-center gap-1.5"
    >
      {items.map(({ key, label, item }) => (
        <StatusIndicator
          key={key}
          id={key}
          label={label}
          severity={item.severity}
          summary={item.summary}
          compact={compact}
          onClick={() => openDrawer(key)}
        />
      ))}
    </div>
  )
}
