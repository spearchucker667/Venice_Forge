/** @fileoverview Compact attachment chip tray displayed above the chat input. */

import React from "react";
import type { Attachment } from "../types/attachment";

interface AttachmentTrayProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function attachmentIcon(type: Attachment["type"]) {
  if (type === "image") return "🖼";
  if (type === "url") return "🔗";
  return "📄";
}

function truncateName(name: string, max = 24): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

export function AttachmentTray({ attachments, onRemove, disabled }: AttachmentTrayProps) {
  if (!attachments.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-1.5" role="list" aria-label="Attachments">
      {attachments.map((att) => (
        <div
          key={att.id}
          role="listitem"
          className="inline-flex items-center gap-1 bg-surface-elevated border border-border rounded px-1.5 py-0.5 text-xs text-text-secondary"
          title={att.name}
        >
          <span className="text-[11px]" aria-hidden="true">{attachmentIcon(att.type)}</span>
          <span className="truncate max-w-[120px]">{truncateName(att.name)}</span>
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            disabled={disabled}
            className="ml-0.5 text-text-muted hover:text-danger disabled:opacity-50"
            aria-label={`Remove ${att.name}`}
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
