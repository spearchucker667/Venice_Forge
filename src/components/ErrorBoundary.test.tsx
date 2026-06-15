import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import * as logger from "../shared/logger";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test crash");
  }
  return <div>Normal content</div>;
}

describe("ErrorBoundary", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    consoleError.mockClear();
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  // T-026 regression guard: raw error text must never be surfaced in the UI.
  it("does not display raw error message or stack in the fallback (T-026)", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/Test crash/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ThrowError/)).not.toBeInTheDocument();
    expect(screen.queryByText(/at\s+/)).not.toBeInTheDocument();
    expect(screen.getByText(/try again or reload to recover/i)).toBeInTheDocument();
  });

  // T-026 regression guard: raw Error objects/messages/stacks must not be logged.
  it("logs a safe generic message and does not pass the raw error object (T-026)", () => {
    const loggerError = vi.spyOn(logger, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(loggerError).toHaveBeenCalled();
    for (const call of loggerError.mock.calls) {
      const joined = call.map(String).join(" ");
      expect(joined).not.toMatch(/Test crash/);
      expect(joined).not.toMatch(/ThrowError/);
      expect(joined).not.toMatch(/at\s+/);
    }

    loggerError.mockRestore();
  });
});
