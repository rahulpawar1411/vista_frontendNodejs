// ====================================================================
// StatCard Component (src/components/StatCard/StatCard.jsx)
// Paired with: src/components/StatCard/StatCard.css
// Reusable metric card display for dashboard overview.
// ====================================================================

import React from 'react';
import './StatCard.css'; // Paired CSS file

/**
 * WHAT: Small KPI tile (title, number, icon) on the sales dashboard.
 * WHY: Visual summary of counts like total leads or won deals.
 * HOW: Presentational only — parent passes value and Lucide icon component.
 */
export default function StatCard({ title, value, icon: Icon, color, bgColor }) {
  return (
    <div className="stat-card">
      <div 
        className="stat-icon-box" 
        style={{ backgroundColor: bgColor || '#eff6ff', color: color || '#2563eb' }}
      >
        {Icon && <Icon size={22} />}
      </div>
      <div className="stat-details">
        <span className="stat-title">{title}</span>
        <span className="stat-value">{value}</span>
      </div>
    </div>
  );
}
