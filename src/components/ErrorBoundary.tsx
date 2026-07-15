import React, { Component, ErrorInfo, ReactNode } from "react";
import { error as logError } from "../shared/logger";
import { uiSoundController } from "../services/uiSoundController";

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // T-026: never log or render raw exception text, messages, or stacks.
    logError("ErrorBoundary caught an error");
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="m-8 rounded-2xl border border-danger/20 bg-danger/10 p-8 backdrop-blur-md shadow-lg"
        >
          <h2 className="text-xl font-display font-semibold text-danger mb-3">Something went wrong.</h2>
          <p className="text-sm text-danger/80 mb-6">
            The app hit an unexpected error and couldn&apos;t render this view. Your work is safe — try again or reload to recover.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn primary"
              onClick={() => {
                uiSoundController.play('primaryClick');
                if (this.props.onReset) this.props.onReset();
                this.setState({ hasError: false });
              }}
            >
              Try again
            </button>
            <button className="btn" onClick={() => { uiSoundController.play('secondaryClick'); window.location.reload(); }}>Reload application</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
