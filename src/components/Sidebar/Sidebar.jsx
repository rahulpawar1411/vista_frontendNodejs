import React from 'react';
import { Home, Users, Plus, Thermometer, ArrowDownLeft, ArrowUpRight, Settings, LogOut } from 'lucide-react';
import Logo from '../Logo/Logo';
import './Sidebar.css'; // Paired CSS file

/**
 * WHAT: Desktop left menu for legacy sales admin (Dashboard, Leads, Temp, Settings).
 * WHY: Matches Header mobile drawer items on large screens.
 * HOW: setActiveTab per button; activeTab gets highlighted styling.
 */
export default function Sidebar({ activeTab, setActiveTab, onLogout }) {
  return (
    <aside className="app-sidebar desktop-only">
      <div className="sidebar-top">
        {/* Official ReeferON Logo */}
        <div className="sidebar-logo-container">
          <Logo />
        </div>

        {/* Navigation List */}
        <ul className="sidebar-nav-list">
          <li>
            <button 
              className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <Home size={19} />
              <span>Sales Dashboard</span>
            </button>
          </li>

          <li>
            <button 
              className={`sidebar-link ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('leads')}
            >
              <Users size={19} />
              <span>Lead Manager</span>
            </button>
          </li>

          <li>
            <button 
              className={`sidebar-link ${activeTab === 'temp-monitor' ? 'active' : ''}`}
              onClick={() => setActiveTab('temp-monitor')}
            >
              <Thermometer size={19} />
              <span>DO Temp Monitor</span>
            </button>
          </li>

          <li>
            <button 
              className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={19} />
              <span>Settings</span>
            </button>
          </li>
        </ul>

        {/* Quick Action Button for DO Window */}
        <button className="sidebar-add-btn" onClick={() => setActiveTab('temp-monitor')}>
          <Plus size={18} />
          <span>Log DO Temp Entry</span>
        </button>
      </div>

      {/* Sidebar Footer User Profile */}
      <div className="sidebar-bottom">
        <div className="user-profile-badge">
          <div className="avatar-circle">A</div>
          <div className="user-info">
            <strong>Super Admin</strong>
            <span>Active Session</span>
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
