import React from 'react';

export function StatusBlock({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 shadow-sm animate-[fadeIn_0.3s_ease]" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 shadow-sm animate-[fadeIn_0.3s_ease]" role="status" aria-live="polite">
          {success}
        </div>
      )}
    </>
  );
}

