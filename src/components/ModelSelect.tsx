import React from "react";
import { ModelInfo } from "../types/venice";

export function ModelSelect({
  value,
  models,
  onChange,
}: {
  value: string;
  models: ModelInfo[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
    >
      {(models || []).map((m) => (
        <option key={m.id} value={m.id}>
          {m.id}
        </option>
      ))}
    </select>
  );
}
