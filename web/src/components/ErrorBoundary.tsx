import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
}

/** Keeps a crashing project from taking down the whole site. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
