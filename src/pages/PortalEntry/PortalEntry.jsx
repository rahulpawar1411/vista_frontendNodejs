// ====================================================================
// Portal Entry Component (src/pages/PortalEntry/PortalEntry.jsx)
// Paired with: src/pages/PortalEntry/PortalEntry.css
// Separate Portal Entry screen to launch DO Window vs Super Admin Window.
// ====================================================================

import React from 'react';
import { Thermometer, ShieldCheck, ArrowRight, Truck, LayoutDashboard } from 'lucide-react';
import Logo from '../../components/Logo/Logo';
import './PortalEntry.css'; // Paired CSS file

/**
 * WHAT: Landing cards to pick Admin, DO, or Customer window (when enabled).
 * WHY: One login can theoretically reach different portals; this is the chooser UI.
 * HOW: Buttons call onSelectWindow with a window key; App updates URL and selectedWindow.
 */
export default function PortalEntry({ onSelectWindow }) {
  return (
    <div className="portal-entry-page">
      <div className="portal-card">
        {/* Logo */}
        <div className="portal-logo-block">
          <Logo />
        </div>

        {/* Heading */}
        <div className="portal-heading">
          <h2>Select Application Window</h2>
          <p>Choose your role window to enter dedicated workspace</p>
        </div>

        {/* 2 Window Option Cards */}
        <div className="portal-windows-grid">
          {/* Commented out Option 1: Data Operator (DO) Window
          <div 
            className="window-option-card do-card" 
            onClick={() => onSelectWindow('do_window')}
          >
            <div className="window-icon-badge">
              <Thermometer size={28} />
            </div>
            <div className="window-info">
              <h3>DO Operator Window</h3>
              <p>Dedicated thermal inspection window for Inward receiving, Outward dispatch, and daily temperature logs.</p>
            </div>
            <span className="enter-btn">
              <span>Open DO Window</span>
              <ArrowRight size={14} />
            </span>
          </div>
          */}

          {/* Option 2: Super Admin Window */}
          <div 
            className="window-option-card admin-card" 
            onClick={() => onSelectWindow('super_admin')}
          >
            <div className="window-icon-badge">
              <LayoutDashboard size={28} />
            </div>
            <div className="window-info">
              <h3>Super Admin Window</h3>
              <p>Complete management window for Sales Dashboard, Lead Manager, DO Log Overviews, and Settings.</p>
            </div>
            <span className="enter-btn">
              <span>Open Admin Window</span>
              <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
