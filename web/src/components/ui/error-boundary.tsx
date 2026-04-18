"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorFallback } from "./error-fallback";

type Props = {
  children: ReactNode;
  /** Optional custom fallback; if omitted, renders ErrorFallback */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Passed to the default ErrorFallback as its heading */
  title?: string;
  /** Renders the default ErrorFallback in compact inline mode */
  inline?: boolean;
};

type State = { error: Error | null };

/**
 * React class-based error boundary for isolating client component subtrees.
 * Use this inside "use client" components to prevent a crash in one panel
 * from killing the entire page.
 *
 * Usage:
 *   <ErrorBoundary title="Thread failed to load" inline>
 *     <ThreadWorkspace ... />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <ErrorFallback
        error={error}
        reset={this.reset}
        title={this.props.title}
        inline={this.props.inline}
      />
    );
  }
}
