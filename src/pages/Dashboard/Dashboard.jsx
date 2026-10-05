// ====================================================================
// Dashboard Page Component (src/pages/Dashboard/Dashboard.jsx)
// Paired with: src/pages/Dashboard/Dashboard.css
// Responsive Home screen presenting key metrics & sales overview.
// ====================================================================

import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Clock, Trophy, AlertTriangle } from 'lucide-react';
import StatCard from '../../components/StatCard/StatCard';
import LeadCard from '../../components/LeadCard/LeadCard';
import { fetchDashboardStats, fetchLeads } from '../../services/api';
import './Dashboard.css'; // Paired CSS file

/**
 * WHAT: Sales dashboard with lead stats and quick navigation widgets.
 * WHY: Super Admin legacy sales view summarizes pipeline at a glance.
 * HOW: fetchDashboardStats and fetchLeads on mount; StatCards and links call setActiveTab.
 */
export default function Dashboard({ setActiveTab, setSelectedLead }) {
  const [stats, setStats] = useState({
    totalLeads: 0,
    newLeads: 0,
    inProgressLeads: 0,
    wonLeads: 0,
    totalValue: 0,
    overdueInspections: 0
  });

  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      const statsData = await fetchDashboardStats();
      const leadsData = await fetchLeads();
      setStats(statsData);
      setRecentLeads(leadsData.slice(0, 4));
      setLoading(false);
    }
    loadDashboardData();
  }, []);

  const formattedPipeline = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(stats.totalValue || 0);

  return (
    <div className="dashboard-page">
      {/* 1. Hero Welcome Banner */}
      <div className="welcome-banner">
        <h2>ReeferON Cold Chain Hub</h2>
        <p>Anything to Everything in Cold Chain — Sales & Operations Management</p>
        
        <div className="pipeline-highlight">
          <span>Total Pipeline Value</span>
          <strong>{formattedPipeline}</strong>
        </div>
      </div>

      {/* 2. Key Metrics Grid (5 columns Desktop, 2 columns Tablet/Mobile) */}
      <div className="stats-grid">
        <StatCard 
          title="Total Leads" 
          value={stats.totalLeads} 
          icon={Users} 
          bgColor="#e0f2fe" 
          color="#00a2e8" 
        />
        <StatCard 
          title="New Leads" 
          value={stats.newLeads} 
          icon={UserPlus} 
          bgColor="#dbeafe" 
          color="#1e40af" 
        />
        <StatCard 
          title="In Progress" 
          value={stats.inProgressLeads} 
          icon={Clock} 
          bgColor="#f3e8ff" 
          color="#6b21a8" 
        />
        <StatCard 
          title="Deals Won" 
          value={stats.wonLeads} 
          icon={Trophy} 
          bgColor="#dcfce7" 
          color="#15803d" 
        />
        <StatCard 
          title="Overdue Tasks Alert" 
          value={stats.overdueInspections || 0} 
          icon={AlertTriangle} 
          bgColor={stats.overdueInspections > 0 ? '#fee2e2' : '#f1f5f9'} 
          color={stats.overdueInspections > 0 ? '#dc2626' : '#64748b'} 
        />
      </div>

      {/* 3. Recent Activity Grid */}
      <div className="section-header">
        <h3>Recent Sales Activity</h3>
        <button className="see-all-btn" onClick={() => setActiveTab('leads')}>
          View All ({stats.totalLeads})
        </button>
      </div>

      <div className="recent-leads-grid">
        {loading ? (
          <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', gridColumn: '1/-1' }}>
            Loading metrics...
          </p>
        ) : recentLeads.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', gridColumn: '1/-1' }}>
            No leads found yet. Tap Add Lead to create one!
          </p>
        ) : (
          recentLeads.map(lead => (
            <LeadCard 
              key={lead.id} 
              lead={lead} 
              onSelect={(selected) => setSelectedLead(selected)} 
            />
          ))
        )}
      </div>
    </div>
  );
}
