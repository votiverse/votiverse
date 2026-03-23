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
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-800 mb-2">{t("error.boundary.title")}</h2>
        <p className="text-sm text-red-600 mb-4">
          {message ?? t("error.boundary.unexpected")}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
          >
            {t("error.boundary.tryAgain")}
          </button>
          <button
            onClick={onReload}
            className="px-4 py-2 bg-white text-red-700 text-sm font-medium rounded-md border border-red-300 hover:bg-red-50 transition-colors"
          >
            {t("error.boundary.reload")}
          </button>
        </div>
      </div>
    </div>
  );
}
