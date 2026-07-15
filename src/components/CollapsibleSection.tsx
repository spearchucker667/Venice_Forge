import React, { useState, useId } from "react";
import { uiSoundController } from "../services/uiSoundController";

export function CollapsibleSection({ title, children, defaultOpen = false }: { title: React.ReactNode, children: React.ReactNode, defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const headingId = useId();

  return (
    <div className="rounded-xl border border-border/50 bg-surface/50 overflow-hidden backdrop-blur-sm">
      <button
        id={headingId}
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => {
          uiSoundController.play('secondaryClick');
          setOpen(!open);
        }}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-text-secondary transition-colors duration-200 hover:bg-surface-elevated"
      >
        <span>{title}</span>
        <span aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headingId}
          className="border-t border-border/50 p-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}
