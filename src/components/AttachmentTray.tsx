/** @fileoverview Compact attachment chip tray displayed above the chat input. */

import React, { useState } from "react";
import { ImageIcon, LinkIcon, FileTextIcon, XIcon } from "./icons";
import type { Attachment } from "../types/attachment";

interface AttachmentTrayProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onReorder?: (newOrder: Attachment[]) => void;
  disabled?: boolean;
}

function AttachmentTypeIcon({ type }: { type: Attachment["type"] }) {
  if (type === "image") return <ImageIcon size={12} />;
  if (type === "url") return <LinkIcon size={12} />;
  return <FileTextIcon size={12} />;
}

function truncateName(name: string, max = 24): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

export function AttachmentTray({ attachments, onRemove, onReorder, disabled }: AttachmentTrayProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  if (!attachments.length) return null;

  function handleDragStart(e: React.DragEvent, id: string) {
    if (disabled) return;
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault(); // Necessary to allow dropping
    if (!draggedId || draggedId === id || !onReorder || disabled) return;

    const draggedIndex = attachments.findIndex(a => a.id === draggedId);
    const targetIndex = attachments.findIndex(a => a.id === id);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newAttachments = [...attachments];
    const [draggedItem] = newAttachments.splice(draggedIndex, 1);
    newAttachments.splice(targetIndex, 0, draggedItem);
    
    onReorder(newAttachments);
  }

  function handleDragEnd() {
    setDraggedId(null);
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-1.5" role="list" aria-label="Attachments">
      {attachments.map((att) => (
        <div
          key={att.id}
          role="listitem"
          draggable={!disabled}
          onDragStart={(e) => handleDragStart(e, att.id)}
          onDragOver={(e) => handleDragOver(e, att.id)}
          onDragEnd={handleDragEnd}
          className={`inline-flex items-center gap-1.5 bg-surface-elevated border border-border rounded-md px-2 py-1 text-xs text-text-secondary ${draggedId === att.id ? "opacity-50" : ""} ${!disabled ? "cursor-grab active:cursor-grabbing" : ""}`}
          title={att.name}
        >
          <span className="text-text-muted cursor-grab active:cursor-grabbing" aria-hidden="true" draggable={!disabled} onDragStart={(e) => e.preventDefault()}>
            <AttachmentTypeIcon type={att.type} />
          </span>
          <span className="truncate max-w-[120px] pointer-events-none">{truncateName(att.name)}</span>
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            disabled={disabled}
            className="ml-0.5 text-text-muted hover:text-danger disabled:opacity-50 transition-colors"
            aria-label={`Remove ${att.name}`}
            title="Remove"
          >
            <XIcon size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
