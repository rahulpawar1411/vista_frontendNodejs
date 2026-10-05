import React from 'react';
import ExportErrorBanner from '../ExportErrorBanner/ExportErrorBanner';

/**
 * WHAT: Shows a red banner when a page failed to load data from the server.
 * WHY: Users need a clear message and a Retry button instead of a silent empty table.
 * HOW: Wraps ExportErrorBanner so load errors look the same as export errors.
 */
export default function LoadErrorBanner({ message, retryable = true, onRetry, onDismiss }) {
  return (
    <ExportErrorBanner
      message={message}
      retryable={retryable}
      onRetry={onRetry}
      onDismiss={onDismiss}
    />
  );
}
