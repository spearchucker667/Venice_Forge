import { ReactNode } from 'react';

export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {children}
    </div>
  );
}
