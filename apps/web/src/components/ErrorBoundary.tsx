import { StateIcon } from './StatusMessage';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'wouter';

interface ErrorBoundaryProps {
  children: ReactNode;
  withinShell?: boolean;
  resetKey?: string;
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

  public componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private readonly reloadPage = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.withinShell) {
        return (
          <section className="state-message state-message--error" role="alert">
            <h1>This page could not be opened</h1>
            <p>
              Check your connection and try reloading. Any submitted action may
              still have completed; check its latest status before submitting
              again.
            </p>
            <div className="state-message__actions">
              <button
                className="button"
                onClick={this.reloadPage}
                type="button"
              >
                Reload this page
              </button>
              <Link className="button button--quiet" href="/">
                Return home
              </Link>
              <Link className="button button--quiet" href="/offline">
                Open saved events
              </Link>
            </div>
          </section>
        );
      }
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
