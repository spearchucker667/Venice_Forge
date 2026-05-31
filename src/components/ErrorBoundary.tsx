import React, { Component, ErrorInfo, ReactNode } from "react";
import { error as logError } from "../shared/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="m-8 rounded-2xl border border-danger/20 bg-danger/10 p-8 backdrop-blur-md shadow-lg">
          <h2 className="text-xl font-display font-semibold text-danger mb-3">Something went wrong.</h2>
          <p className="text-sm text-danger/80 mb-6">{this.state.error?.message}</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn primary" onClick={() => this.setState({ hasError: false })}>Try again</button>
            <button className="btn" onClick={() => window.location.reload()}>Reload application</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
