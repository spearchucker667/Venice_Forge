/** @fileoverview Minimal Material-style inline SVG icons for Venice Forge.
 *  All icons are 20x20px with 1.5px stroke and currentColor fill.
 */

import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

function iconBase(size: number, className = ""): React.SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    "aria-hidden": true,
  };
}

export function PaperclipIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function ImageIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export function LinkIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function SendIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="m22 2-7 20-4-9-9-4 20-7z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function BrainIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}

export function ChevronLeftIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function PanelLeftIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

export function PanelLeftCloseIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M9 3v18" />
      <path d="m14 9-3 3 3 3" />
    </svg>
  );
}

export function PanelLeftOpenIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M9 3v18" />
      <path d="m12 9 3 3-3 3" />
    </svg>
  );
}

export function XIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function FileTextIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

export function GlobeIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function SparklesIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

export function SearchIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function PlusIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function EditIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function TrashIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...iconBase(size, className)}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
