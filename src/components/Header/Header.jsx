// ====================================================================
// Header Component (src/components/Header/Header.jsx)
// Paired with: src/components/Header/Header.css
// Mobile Right-Side Navigation Drawer with Background Scroll Lock
// Active Menu items match exact desktop sidebar gradient colors.
// ====================================================================

import React, { useState, useEffect } from 'react';
import { Clock, Menu, X, Home, Users, Thermometer, Settings, ChevronRight, ShieldCheck } from 'lucide-react';
import Logo from '../Logo/Logo';
import './Header.css'; // Paired CSS file

/**
 * WHAT: Top bar with logo, live clock, title, and mobile navigation drawer.
 * WHY: Sales admin pages need navigation on small screens without a bottom menu.
 * HOW: Hamburger opens a right drawer; selecting a tab calls setActiveTab and closes the drawer.
 */
export default function Header({ title, activeTab, setActiveTab }) {
  const [timeState, setTimeState] = useState(new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lock background scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Real-time ticking clock effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeState(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = timeState.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const formattedTime = timeState.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };

  const handleMenuSelect = (tabKey) => {
    if (setActiveTab) setActiveTab(tabKey);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="app-header">
        {/* Left: Logo + Compact Live Clock Badge Underneath */}
        <div className="header-left-group">
          <Logo compact={true} />

          {/* Live Clock Badge - Compact & 100% Fit */}
          <div className="header-logo-clock" title="Current System Time">
            <Clock size={12} color="#00a2e8" style={{ flexShrink: 0 }} />
            <span className="clock-date">{formattedDate}</span>
            <span className="clock-divider">|</span>
            <span className="clock-time">{formattedTime}</span>
          </div>
        </div>

        {/* Desktop Only Title */}
        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center' }}>
          <h1 className="header-title-text">{title || 'Super Admin Dashboard'}</h1>
        </div>

        {/* Right: Top Right Hamburger Menu Button for Mobile & Role Badge */}
        <div className="header-actions">
          <span className="desktop-only" style={{ backgroundColor: '#ecfccb', color: '#65a30d', padding: '3px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800 }}>
            Super Admin
          </span>
          
          <button 
            className={`mobile-hamburger-btn mobile-only ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={toggleMobileMenu}
            aria-label="Toggle Navigation Menu"
            title="Open Menu"
          >
            {isMobileMenuOpen ? <X size={22} color="#00a2e8" /> : <Menu size={22} color="#0f172a" />}
          </button>
        </div>
      </header>

      {/* Backdrop Blur Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-backdrop-overlay mobile-only" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Right-Side Slide-In Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="mobile-right-drawer mobile-only">
          {/* Drawer Header */}
          <div className="right-drawer-header">
            <div className="drawer-user-info">
              <div className="user-avatar-circle admin">
                <ShieldCheck size={16} color="#84c225" />
              </div>
              <div className="user-text">
                <strong>Super Admin</strong>
                <span>Admin Window</span>
              </div>
            </div>
            <button className="right-drawer-close" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="right-drawer-section">Navigation</div>

          <div className="clean-menu-list">
            <button 
              className={`clean-menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('dashboard')}
            >
              <div className="item-left">
                <Home size={18} className="item-icon" />
                <span>Sales Dashboard</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('leads')}
            >
              <div className="item-left">
                <Users size={18} className="item-icon" />
                <span>Lead Manager</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeTab === 'temp-monitor' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('temp-monitor')}
            >
              <div className="item-left">
                <Thermometer size={18} className="item-icon" />
                <span>DO Temp Monitor</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('settings')}
            >
              <div className="item-left">
                <Settings size={18} className="item-icon" />
                <span>Settings</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
