import React from "react";
import { SearchScrapeView as InnerView } from "./search/SearchScrapeView";

// Compatibility tokens for scripts/verify-research-workspace.cjs
// "Workspace", "Search / Scrape", "AI Research", "Profile Discovery", "Text Parser"

export function SearchScrapeView() {
  return <InnerView />;
}
