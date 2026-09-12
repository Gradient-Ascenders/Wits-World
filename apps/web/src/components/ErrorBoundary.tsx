import { StateIcon } from './StatusMessage';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      'Wits World encountered an unexpected rendering error.',
      error,
      errorInfo,
    );
  }

  private readonly reloadPage = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <main
          aria-labelledby="unexpected-error-title"
          className="standalone-state"
          role="alert"
        >
          <div className="standalone-state__panel state-message state-message--error">
            <StateIcon tone="error" />
            <p className="eyebrow">Unexpected error</p>
            <h1 id="unexpected-error-title">
              This page could not be displayed
            </h1>
            <p>
              Wits World could not display this page. Reload the application and
              try again.
            </p>
            <button className="button" onClick={this.reloadPage} type="button">
              Reload Wits World
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
