import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && parsed.error) {
          displayMessage = `${parsed.error} (${parsed.operationType || 'operation'})`;
        }
      } catch {
        // Not JSON
      }

      return (
        <div className="min-h-screen bg-[#09090B] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#111114] border border-zinc-800 p-6 space-y-4">
            <h1 className="font-display text-lg font-semibold text-zinc-100">
              Something went wrong
            </h1>
            <p className="text-sm text-zinc-400 break-words">{displayMessage}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
            >
              Return to Studio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
