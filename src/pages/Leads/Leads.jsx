// ====================================================================
// Leads Page Component (src/pages/Leads/Leads.jsx)
// Paired with: src/pages/Leads/Leads.css
// Responsive lead list page with real-time search and status filter tabs.
// ====================================================================

import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import LeadCard from '../../components/LeadCard/LeadCard';
import { fetchLeads } from '../../services/api';
import './Leads.css'; // Paired CSS file

const STATUS_FILTERS = ['All', 'New', 'Contacted', 'In Progress', 'Won', 'Lost'];

/**
 * WHAT: Searchable list of sales leads with status filters.
 * WHY: Sales team tracks prospects from New through Won/Lost.
 * HOW: fetchLeads; filter client-side; LeadCard opens LeadDetails via setSelectedLead.
 */
export default function Leads({ setSelectedLead }) {
  const [leads, setLeads] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLeads() {
      setLoading(true);
      const data = await fetchLeads(activeFilter, searchQuery);
      setLeads(data);
      setLoading(false);
    }
    loadLeads();
  }, [activeFilter, searchQuery]);

  return (
    <div className="leads-page">
      {/* 1. Search Box */}
      <div className="search-wrapper">
        <Search className="search-icon" size={20} />
        <input 
          type="text"
          className="search-input"
          placeholder="Search leads by name, company, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 2. Status Filter Pills */}
      <div className="filter-pills-bar">
        {STATUS_FILTERS.map(status => (
          <button
            key={status}
            className={`pill-btn ${activeFilter === status ? 'active' : ''}`}
            onClick={() => setActiveFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      {/* 3. Responsive Leads Grid */}
      <div className="leads-grid">
        {loading ? (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.88rem', gridColumn: '1/-1', padding: '20px' }}>
            Loading leads...
          </p>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b', gridColumn: '1/-1' }}>
            <p style={{ fontWeight: 600 }}>No leads found</p>
            <span style={{ fontSize: '0.82rem' }}>Try clearing filters or search criteria.</span>
          </div>
        ) : (
          leads.map(lead => (
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
