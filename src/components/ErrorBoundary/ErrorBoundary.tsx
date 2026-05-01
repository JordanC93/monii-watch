/**
 * ErrorBoundary — recovers from render-time exceptions.
 *
 * Wraps routes + report cards + modals so a single throwing component
 * doesn't take down the whole app (the v0.5.14 theme freeze was
 * exactly this kind of thing). On error:
 *
 *   1. Logs to the in-app `lib/logs.ts` capture so users can see it
 *      under Settings → Debug logs
 *   2. Shows a recoverable fallback with: error summary, "Copy crash
 *      report" button, and "Retry" / "Go home" buttons
 *   3. Auto-resets when its `resetKey` prop changes (e.g. route
 *      navigation) so users don't get stuck on a stale error page
 */

import React from 'react';
import { AlertTriangle, RotateCcw, Home, Copy } from 'lucide-react';

type Props = {
  /** Fallback variant. `route` is full-page; `card` is inline. */
  variant?: 'route' | 'card';
  /** Reset state automatically when this changes (e.g. pathname). */
  resetKey?: string;
  /** Where to send the user on "Go home". */
  homePath?: string;
  /** Display name used in copy-paste reports + logs. */
  scope?: string;
  children: React.ReactNode;
};

type State = {
  error: Error | null;
  componentStack: string | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    // Pipe into the existing in-app log capture.
    try {
      console.error(`[error-boundary:${this.props.scope ?? 'unknown'}]`, error.message, error.stack, info.componentStack);
    } catch {}
  }

  componentDidUpdate(prev: Props) {
    if (this.props.resetKey !== prev.resetKey && this.state.error) {
      this.setState({ error: null, componentStack: null });
    }
  }

  reset = () => {
    this.setState({ error: null, componentStack: null });
  };

  copyReport = async () => {
    const { error, componentStack } = this.state;
    if (!error) return;
    const report = [
      `Monii Watch crash report`,
      `Scope: ${this.props.scope ?? 'unknown'}`,
      `When: ${new Date().toISOString()}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `User-Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
      `Version: ${(window as any).__APP_VERSION__ ?? 'unknown'}`,
      ``,
      `Message: ${error.message}`,
      ``,
      `Stack:`,
      error.stack ?? '(no stack)',
      ``,
      `Component stack:`,
      componentStack ?? '(none)',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      // fall back to selection-based copy via a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
  };

  goHome = () => {
    const path = this.props.homePath ?? '/budget';
    if (typeof window !== 'undefined') {
      window.location.href = path;
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isCard = this.props.variant === 'card';
    return (
      <div
        role="alert"
        className={
          isCard
            ? 'glass-panel ring-1 ring-negative/40 p-4 sm:p-5 text-[12.5px] my-2'
            : 'min-h-[60vh] flex items-center justify-center p-5'
        }
      >
        <div className={isCard ? '' : 'glass-panel p-6 sm:p-8 max-w-md w-full ring-1 ring-negative/30'}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={isCard ? 18 : 24} className="text-negative flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className={isCard ? 'text-[13px] font-semibold' : 'text-[15px] font-semibold'}>
                Something went wrong{this.props.scope ? ` in ${this.props.scope}` : ''}.
              </div>
              <div className="text-[12px] text-fg-subtle mt-1 break-words">
                {error.message || 'An unexpected error occurred.'}
              </div>
              {!isCard && (
                <div className="text-[11px] text-fg-subtle mt-2">
                  Your data is safe; Monii saves locally. Try retrying, or go back to the budget.
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={this.reset}
                  className="text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent/15 text-accent hover:bg-accent/25"
                >
                  <RotateCcw size={12} /> Retry
                </button>
                <button
                  onClick={this.copyReport}
                  className="text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-2 hover:bg-surface-3"
                >
                  <Copy size={12} /> Copy report
                </button>
                {!isCard && (
                  <button
                    onClick={this.goHome}
                    className="text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-2 hover:bg-surface-3"
                  >
                    <Home size={12} /> Go to budget
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
