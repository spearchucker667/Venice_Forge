import React from 'react';

export function StatusBlock({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {success && (
        <div className="success" role="status" aria-live="polite">
          {success}
        </div>
      )}
    </>
  );
}
