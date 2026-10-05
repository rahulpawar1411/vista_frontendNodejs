import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import './ExportErrorBanner.css';

/**
 * WHAT: Inline alert when CSV export fails (network, timeout, or server error).
 * WHY: Exports can be large; users should retry without losing their filters.
 * HOW: Renders message plus Retry and optional Dismiss buttons.
 */
export default function ExportErrorBanner({ message, retryable = true, onRetry, onDismiss }) {
  if (!message) return null;

  return (
    <div className="export-error-banner" role="alert">
      <div className="export-error-banner-main">
        <AlertCircle size={16} className="export-error-banner-icon" aria-hidden="true" />
        <span className="export-error-banner-text">{message}</span>
      </div>
      <div className="export-error-banner-actions">
        {retryable && typeof onRetry === 'function' ? (
          <button type="button" className="export-error-retry-btn" onClick={onRetry}>
            <RefreshCw size={14} />
            Retry
          </button>
        ) : null}
        {typeof onDismiss === 'function' ? (
          <button
            type="button"
            className="export-error-dismiss-btn"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
