import React from 'react';
import { Chip } from './Chip';
import { DiagnosticsEntry } from '../types/venice';

export function DiagPreview({ diagnostics }: { diagnostics: DiagnosticsEntry | null }) {
  if (!diagnostics) return <Chip>no requests yet</Chip>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tone={diagnostics.ok ? "ok" : "danger"}>
        {diagnostics.status || "network"} {diagnostics.ok ? "OK" : "error"}
      </Chip>
      <Chip>{diagnostics.endpoint}</Chip>
      {diagnostics.headers?.["CF-RAY"] && (
        <Chip>CF-RAY {diagnostics.headers["CF-RAY"]}</Chip>
      )}
    </div>
  );
}
