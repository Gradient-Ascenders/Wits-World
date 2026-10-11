import { StateIcon } from './StatusMessage';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'wouter';
import { RouteLoadRecovery } from './RouteLoadRecovery';

/** Do not misclassify API, authentication or rendering errors as page files. */
function isPageModuleError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(
      `${error.name}: ${error.message}`,
    )
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  withinShell?: boolean;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  public static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
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
      this.setState({ hasError: false, error: null });
    }
  }

  private readonly reloadPage = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.withinShell) {
        if (isPageModuleError(this.state.error)) {
          return (
            <RouteLoadRecovery
              pathname={this.props.resetKey}
              onReload={this.reloadPage}
            />
          );
        }
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
              {this.props.resetKey === '/offline' ? (
                <button
                  className="button button--quiet"
                  onClick={() =>
                    this.setState({ hasError: false, error: null })
                  }
                  type="button"
                >
                  Retry saved play
                </button>
              ) : (
                <Link className="button button--quiet" href="/offline">
                  Open saved events
                </Link>
              )}
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
