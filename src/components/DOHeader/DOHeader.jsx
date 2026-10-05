// ====================================================================
// DO Header Component (src/components/DOHeader/DOHeader.jsx)
// Paired with: src/components/DOHeader/DOHeader.css
// Mobile Right-Side Navigation Drawer with Background Scroll Lock
// Active Menu items match exact desktop sidebar gradient colors.
// ====================================================================

import React, { useState, useEffect } from 'react';
import { Clock, Menu, X, Thermometer, ArrowDownLeft, ArrowUpRight, ChevronRight, User, LogOut, Bell, Search } from 'lucide-react';
import Logo from '../Logo/Logo';
import './DOHeader.css'; // Paired CSS file

/**
 * WHAT: Top bar for the Data Operator web shell (title, menu, notifications dot).
 * WHY: DO screens share one header across Inward, Outward, History, etc.
 * HOW: Shows activeTitle; mobile menu mirrors DOSidebar items; red dot when hasNotificationAlert.
 */
export default function DOHeader({ user, activeTitle, activeDOMenu, setActiveDOMenu, onLogout, hasNotificationAlert = false }) {
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

  // Formatted Date & Time Strings
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

  const handleMenuSelect = (menuKey) => {
    if (setActiveDOMenu) setActiveDOMenu(menuKey);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="do-header">
        {/* Left: Official Logo + Compact Live Clock Badge Underneath */}
        <div className="do-header-brand-group">
          <Logo compact={true} />
          
          {/* Live Real-time Clock Badge */}
          <div className="header-logo-clock" title="Current System Time">
            <Clock size={12} color="#00a2e8" style={{ flexShrink: 0 }} />
            <span className="clock-date">{formattedDate}</span>
            <span className="clock-divider">|</span>
            <span className="clock-time">{formattedTime}</span>
          </div>
        </div>

        {/* Desktop Only Title */}
        <div className="desktop-only" style={{ display: 'flex', alignItems: 'center' }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-dark)' }}>{activeTitle || 'DO Daily Temp Monitor'}</h1>
        </div>

        {/* Right: Top Right Hamburger Menu Button for Mobile & Role Badge */}
        <div className="do-header-actions">
          <span className="do-role-tag desktop-only">DO Operator Window</span>
          
          <button 
            className={`mobile-hamburger-btn mobile-only ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={toggleMobileMenu}
            aria-label="Toggle Navigation Menu"
            title="Open Menu"
          >
            {isMobileMenuOpen ? <X size={22} color="#00a2e8" /> : <Menu size={22} color="#0f172a" />}
            {hasNotificationAlert && !isMobileMenuOpen ? (
              <span className="pulsing-dot do-notif-dot do-notif-dot--hamburger" aria-hidden="true" />
            ) : null}
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
          <div className="right-drawer-header" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            <div className="drawer-user-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="user-avatar-circle" style={{ 
                width: '36px', 
                height: '36px', 
                borderRadius: '50%', 
                backgroundColor: '#00a2e8', 
                color: '#ffffff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontWeight: 'bold',
                fontSize: '0.85rem',
                flexShrink: 0
              }}>
                {(user?.full_name || 'DO').substring(0, 2).toUpperCase()}
              </div>
              <div className="user-text" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <strong style={{ fontSize: '0.85rem', color: 'var(--text-dark)' }}>{user?.full_name || 'Data Operator'}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user?.email || ''}</span>
                <span style={{ fontSize: '0.68rem', color: '#ea580c', fontWeight: 'bold' }}>{user?.warehouse_name || 'ReeferON CRM'}</span>
              </div>
            </div>
            <button className="right-drawer-close" onClick={() => setIsMobileMenuOpen(false)} style={{ marginLeft: 'auto' }}>
              <X size={20} />
            </button>
          </div>

          <div className="right-drawer-section">Navigation</div>

          <div className="clean-menu-list">
            <button 
              className={`clean-menu-item ${activeDOMenu === 'All' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('All')}
            >
              <div className="item-left">
                <Thermometer size={18} className="item-icon" />
                <span>DO Daily Temp Monitor</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item inward ${activeDOMenu === 'Inward' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('Inward')}
            >
              <div className="item-left">
                <ArrowDownLeft size={18} className="item-icon inward-icon" />
                <span>Inward Temp Monitor</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item outward ${activeDOMenu === 'Outward' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('Outward')}
            >
              <div className="item-left">
                <ArrowUpRight size={18} className="item-icon outward-icon" />
                <span>Outward Temp Monitor</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeDOMenu === 'History' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('History')}
            >
              <div className="item-left">
                <Clock size={18} className="item-icon" />
                <span>History Logs</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeDOMenu === 'Lookup' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('Lookup')}
            >
              <div className="item-left">
                <Search size={18} className="item-icon" />
                <span>Profile Lookup</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeDOMenu === 'Notifications' ? 'active' : ''}`}
              onClick={() => handleMenuSelect('Notifications')}
              style={{ borderBottom: '1px solid var(--border)' }}
              aria-label={hasNotificationAlert ? 'Notifications — approval waiting' : 'Notifications'}
            >
              <div className="item-left">
                <Bell size={18} className="item-icon" />
                <span>Notifications</span>
                {hasNotificationAlert ? (
                  <span className="pulsing-dot do-notif-dot" aria-hidden="true" />
                ) : null}
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            {/* Logout button in Mobile Drawer */}
            <button 
              className="clean-menu-item"
              onClick={() => {
                setIsMobileMenuOpen(false);
                if (onLogout) onLogout();
              }}
              style={{ marginTop: '20px', color: '#ef4444' }}
            >
              <div className="item-left">
                <LogOut size={18} className="item-icon" style={{ color: '#ef4444' }} />
                <span style={{ fontWeight: '700' }}>Log Out</span>
              </div>
              <ChevronRight size={16} className="item-arrow" style={{ color: '#ef4444' }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
