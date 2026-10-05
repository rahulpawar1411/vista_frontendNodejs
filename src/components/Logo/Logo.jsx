// ====================================================================
// ReeferON Logo Component (src/components/Logo/Logo.jsx)
// Paired with: src/components/Logo/Logo.css
// Renders official ReeferON Cold Chain logo from image asset.
// ====================================================================

import React from 'react';
import logoImg from './logo.png';
import './Logo.css'; // Paired CSS file

/**
 * WHAT: Shows the ReeferON brand logo image.
 * WHY: Same logo on login, headers, and mobile-only screens.
 * HOW: Renders logo.png with optional compact CSS class.
 */
export default function Logo({ compact = false }) {
  return (
    <div className={`reeferon-logo-wrapper ${compact ? 'compact' : ''}`}>
      <img src={logoImg} alt="ReeferON" className="brand-logo-img" />
    </div>
  );
}
