import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * WHAT: Shows a reference number with a copy-to-clipboard button.
 * WHY: DOs share ref numbers with support; copy reduces typos.
 * HOW: navigator.clipboard.writeText; brief check icon feedback.
 */
export default function CopyableRef({ value, className = '' }) {
  const [copied, setCopied] = useState(false);
  const text = value != null && value !== '' ? String(value) : '';

  if (!text || text === '-') {
    return <span className={className}>-</span>;
  }

  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span
      className={`copyable-ref ${copied ? 'is-copied' : ''} ${className}`.trim()}
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          copy(e);
        }
      }}
      role="button"
      tabIndex={0}
      title="Click to copy"
    >
      {text}
      {copied ? <Check size={12} aria-hidden /> : <Copy size={10} aria-hidden className="copyable-ref-icon" />}
    </span>
  );
}
