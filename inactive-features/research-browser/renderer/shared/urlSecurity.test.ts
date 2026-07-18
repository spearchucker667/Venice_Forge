import { describe, expect, it } from "vitest";
import { isAllowedResearchBrowserUrl } from "./urlSecurity";

describe("shared Research Browser URL policy", () => {
  it("allows normal public HTTP and HTTPS browser destinations", () => {
    expect(isAllowedResearchBrowserUrl("https://venice.ai")).toBe(true);
    expect(isAllowedResearchBrowserUrl("http://example.com/docs")).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,hello",
    "chrome://version",
    "devtools://devtools/bundled/inspector.html",
  ])("blocks unsafe browser schemes: %s", (url) => {
    expect(isAllowedResearchBrowserUrl(url)).toBe(false);
  });

  it.each([
    "https://user:pass@example.com",
    "https://localhost:3000",
    "http://127.0.0.1:8000",
    "http://10.0.0.5",
    "http://192.168.1.10",
    "http://[::1]/",
  ])("blocks credentialed and private-network destinations: %s", (url) => {
    expect(isAllowedResearchBrowserUrl(url)).toBe(false);
  });
});
