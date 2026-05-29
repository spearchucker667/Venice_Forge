import React, { useState, useId } from "react";

export function CollapsibleSection({ title, children, defaultOpen = false }: { title: React.ReactNode, children: React.ReactNode, defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const headingId = useId();

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm">
      <button
        id={headingId}
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-zinc-200 transition-colors duration-200 hover:bg-white/5"
      >
        <span>{title}</span>
        <span aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headingId}
          className="border-t border-white/10 p-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}
