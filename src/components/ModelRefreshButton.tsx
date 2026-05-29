import React, { useState } from "react";
import { refreshModels } from "../services/modelService";
import { Chip } from "./Chip";
import { AppState, AppDispatch } from "../types/app";

interface ModelRefreshButtonProps {
  state: AppState;
  dispatch: AppDispatch;
}

export function ModelRefreshButton({ state, dispatch }: ModelRefreshButtonProps) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshModels(dispatch);
    } finally {
      setRefreshing(false);
    }
  }

  const totalModels = Object.values(state.models as Record<string, any[]>).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  const isLive = !state.usingFallbackModels;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="btn"
        onClick={handleRefresh}
        disabled={refreshing}
        title="Fetch all available models from the Venice API"
      >
        {refreshing ? "Fetching…" : "Fetch models"}
      </button>
      <Chip tone={isLive ? "ok" : "warn"}>
        {isLive ? `live · ${totalModels} models` : `fallback · ${totalModels} models`}
      </Chip>
    </div>
  );
}
