import React from "react";
import { APP_NAME, OFFICIAL_LINKS, FIRST_RUN_ACK_KEY } from "../../shared/legal";
import { toast } from "../../stores/toast-store";

export function AboutPanel(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="text-[17px] font-semibold text-text-primary">{APP_NAME}</div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 uppercase tracking-wider font-semibold">
          Unofficial
        </span>
      </div>

      <div className="text-[13px] text-text-secondary leading-relaxed space-y-4">
        <p>
          Venice Forge is a third-party desktop client configured to interface directly with the Venice.ai inference API endpoints. It is not affiliated with, endorsed by, sponsored by, or approved by Venice.ai, Inc.
        </p>

        <div className="p-3 bg-surface-elevated border border-border rounded-lg">
          <div className="text-[11.5px] uppercase tracking-wider text-text-muted font-bold mb-1">Official Links</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <a href={OFFICIAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Terms of Service
            </a>
            <a href={OFFICIAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Privacy Policy
            </a>
            <a href={OFFICIAL_LINKS.apiDocs} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              API Documentation
            </a>
          </div>
        </div>

        <div className="text-[11px] text-text-muted space-y-2">
          <p>
            Venice , Venice.ai , and related logos are trademarks of Venice.ai, Inc. Use of these names is solely for nominative identification of API compatibility.
          </p>
          <p>Reset legal acknowledgment gate:</p>
          <button
            onClick={() => {
              try {
                localStorage.removeItem(FIRST_RUN_ACK_KEY) /* localStorage-allowed: first-run legal ack */;
                toast.success("Legal acknowledgment reset. It will appear on next reload.");
              } catch {
                toast.error("Could not reset acknowledgment.");
              }
            }}
            className="px-3 py-1 rounded bg-surface-elevated border border-border hover:bg-surface text-text-primary cursor-pointer transition-colors"
          >
            Reset gate
          </button>
        </div>
      </div>
    </div>
  );
}
