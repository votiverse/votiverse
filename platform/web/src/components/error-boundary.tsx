import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    // Full page reload — resets all React state and re-checks auth from scratch
    window.location.href = "/";
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <ErrorFallback
          message={this.state.error?.message}
          onRetry={this.handleRetry}
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}

function ErrorFallback({ message, onRetry, onReload }: { message?: string; onRetry: () => void; onReload: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-md mx-auto py-16 text-center">
      <div className="bg-error-subtle border border-error-border rounded-lg p-6">
        <h2 className="text-lg font-bold font-display text-error-text mb-2">{t("error.boundary.title")}</h2>
        <p className="text-sm text-error-text mb-4">
          {message ?? t("error.boundary.unexpected")}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-error text-text-on-accent text-sm font-medium rounded-md hover:bg-error-hover transition-colors"
          >
            {t("error.boundary.tryAgain")}
          </button>
          <button
            onClick={onReload}
            className="px-4 py-2 bg-surface-raised text-error-text text-sm font-medium rounded-md border border-error-border hover:bg-error-subtle transition-colors"
          >
            {t("error.boundary.reload")}
          </button>
        </div>
      </div>
    </div>
  );
}
