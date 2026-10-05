// ====================================================================
// Settings Page Component (src/pages/Settings/Settings.jsx)
// Paired with: src/pages/Settings/Settings.css
// Information screen showing MySQL configuration and developer guides.
// ====================================================================

import React from 'react';
import { Database, Server, Smartphone, Code } from 'lucide-react';
import './Settings.css'; // Paired CSS file

/**
 * WHAT: Read-only info about API URL, environment, and app version hints.
 * WHY: Admins verify which backend and build they are connected to.
 * HOW: Displays import.meta.env and static labels (no secrets).
 */
export default function Settings() {
  return (
    <div className="settings-page">
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>App Configuration</h2>

      {/* Database Status Card */}
      <div className="settings-card">
        <h3><Database size={16} style={{ display: 'inline', marginRight: '6px' }} /> Database Details</h3>
        <div className="info-row">
          <span>Database Name</span>
          <strong>reeferon_crm_db</strong>
        </div>
        <div className="info-row">
          <span>Database Engine</span>
          <strong>MySQL 8.0 / MariaDB</strong>
        </div>
        <div className="info-row">
          <span>Host / Port</span>
          <strong>localhost:3306</strong>
        </div>
        <div className="info-row">
          <span>Main Table</span>
          <strong>leads</strong>
        </div>
      </div>

      {/* API Backend Card */}
      <div className="settings-card">
        <h3><Server size={16} style={{ display: 'inline', marginRight: '6px' }} /> Backend API Server</h3>
        <div className="info-row">
          <span>Framework</span>
          <strong>Node.js + Express.js</strong>
        </div>
        <div className="info-row">
          <span>Server Endpoint</span>
          <strong>http://localhost:5000/api</strong>
        </div>
        <div className="info-row">
          <span>Connection Pool</span>
          <strong>mysql2/promise</strong>
        </div>
      </div>

      {/* Mobile Optimization Card */}
      <div className="settings-card">
        <h3><Smartphone size={16} style={{ display: 'inline', marginRight: '6px' }} /> UI & Developer Guide</h3>
        <div className="info-row">
          <span>Design Mode</span>
          <strong>Mobile-First Viewport</strong>
        </div>
        <div className="info-row">
          <span>CSS Pattern</span>
          <strong>1-to-1 JSX/CSS Pairing</strong>
        </div>
      </div>
    </div>
  );
}
