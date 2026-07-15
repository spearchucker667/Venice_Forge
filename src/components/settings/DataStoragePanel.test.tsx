// @vitest-environment jsdom
// VERIFY-110 regression guard: destructive storage copy matches the IndexedDB-only action scope.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataStoragePanel } from "./DataStoragePanel";

describe("DataStoragePanel", () => {
  it("labels the destructive history action as IndexedDB-only", () => {
    const clearAllHistory = vi.fn();
    render(
      <DataStoragePanel
        exportData={vi.fn()}
        clearLocalSettings={vi.fn()}
        clearAllHistory={clearAllHistory}
      />,
    );

    expect(screen.queryByRole("button", { name: /clear all local history/i })).toBeNull();
    const button = screen.getByRole("button", { name: /clear indexeddb data/i });
    fireEvent.click(button);
    expect(clearAllHistory).toHaveBeenCalledTimes(1);
  });
});
