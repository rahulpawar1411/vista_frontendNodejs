// ====================================================================
// DO Sidebar Component (src/components/DOSidebar/DOSidebar.jsx)
// Paired with: src/components/DOSidebar/DOSidebar.css
// Dedicated Navigation Sidebar for Data Operator (DO) Window.
// ====================================================================

import React from 'react';
import { Thermometer, ArrowDownLeft, ArrowUpRight, Plus, LogOut, History, Bell, Search } from 'lucide-react';
import Logo from '../Logo/Logo';
import './DOSidebar.css'; // Paired CSS file

/**
 * WHAT: Left navigation for Data Operator modules (Daily, Inward, Outward, History, …).
 * WHY: Persistent menu keeps warehouse workflows one click away.
 * HOW: setActiveDOMenu on click; highlights activeDOMenu; shows alert badge on Notifications.
 */
export default function DOSidebar({ user, activeDOMenu, setActiveDOMenu, onLogout, hasNotificationAlert = false }) {
  return (
    <aside className="do-sidebar desktop-only">
      <div className="do-sidebar-top">
        {/* Official ReeferON Logo */}
        <Logo />

        {/* DO Dedicated Menu List */}
        <ul className="do-sidebar-nav">
          <li>
            <button 
              className={`do-sidebar-link ${activeDOMenu === 'All' ? 'active' : ''}`}
              onClick={() => setActiveDOMenu('All')}
            >
              <Thermometer size={19} />
              <span>DO Daily Temp Monitor</span>
            </button>
          </li>

          <li>
            <button 
              className={`do-sidebar-link inward ${activeDOMenu === 'Inward' ? 'active' : ''}`}
              onClick={() => setActiveDOMenu('Inward')}
            >
              <ArrowDownLeft size={19} />
              <span>Inward Temp Monitor</span>
            </button>
          </li>

          <li>
            <button 
              className={`do-sidebar-link outward ${activeDOMenu === 'Outward' ? 'active' : ''}`}
              onClick={() => setActiveDOMenu('Outward')}
            >
              <ArrowUpRight size={19} />
              <span>Outward Temp Monitor</span>
            </button>
          </li>

          <li>
            <button 
              className={`do-sidebar-link ${activeDOMenu === 'History' ? 'active' : ''}`}
              onClick={() => setActiveDOMenu('History')}
            >
              <History size={19} />
              <span>History Logs</span>
            </button>
          </li>

          <li>
            <button 
              className={`do-sidebar-link ${activeDOMenu === 'Lookup' ? 'active' : ''}`}
              onClick={() => setActiveDOMenu('Lookup')}
            >
              <Search size={19} />
              <span>Profile Lookup</span>
            </button>
          </li>

          <li>
            <button 
              className={`do-sidebar-link ${activeDOMenu === 'Notifications' ? 'active' : ''}`}
              onClick={() => setActiveDOMenu('Notifications')}
              aria-label={hasNotificationAlert ? 'Notifications — approval waiting' : 'Notifications'}
            >
              <Bell size={19} />
              <span>Notifications</span>
              {hasNotificationAlert ? (
                <span className="pulsing-dot do-notif-dot" aria-hidden="true" />
              ) : null}
            </button>
          </li>
        </ul>
      </div>

      {/* DO Profile Badge */}
      <div className="do-sidebar-bottom" style={{ borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
        <div className="do-user-badge" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="do-avatar" style={{ 
            width: '36px', 
            height: '36px', 
            borderRadius: '50%', 
            backgroundColor: '#ea580c', 
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
          <div className="do-user-info" style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.full_name || 'Data Operator'}
            </strong>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user?.email || ''}>
              {user?.email || ''}
            </span>
            <span style={{ fontSize: '0.68rem', color: '#ea580c', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user?.warehouse_name || 'Data Operator'}>
              {user?.warehouse_name || 'ReeferON CRM'}
            </span>
          </div>
          <button 
            type="button"
            className="sidebar-logout-btn" 
            onClick={onLogout}
            title="Log Out"
            style={{ background: 'none', border: 'none', color: '#ef4444', padding: '6px', cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
