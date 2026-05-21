import React from 'react';

export function StatusBlock({ error, success }: { error?: string; success?: string }) {
  if (error)
    return (
      <div className="error" role="alert" aria-live="assertive">
        {error}
      </div>
    );
  if (success)
    return (
      <div className="success" role="status" aria-live="polite">
        {success}
      </div>
    );
  return null;
}
