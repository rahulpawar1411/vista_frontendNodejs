// ====================================================================
// Lead Details Page Component (src/pages/LeadDetails/LeadDetails.jsx)
// Paired with: src/pages/LeadDetails/LeadDetails.css
// Screen for viewing single lead info, changing status, or deleting.
// ====================================================================

import React, { useState } from 'react';
import { ArrowLeft, Phone, MessageCircle, Mail, Trash2 } from 'lucide-react';
import { updateLead, deleteLead } from '../../services/api';
import './LeadDetails.css'; // Paired CSS file

/**
 * WHAT: Full view of one lead with status update and delete.
 * WHY: Reps need one screen to edit contact info and move pipeline stage.
 * HOW: updateLead / deleteLead API; onLeadUpdated refreshes parent list.
 */
export default function LeadDetails({ lead, onBack, onLeadUpdated }) {
  const [status, setStatus] = useState(lead.status || 'New');
  const [updating, setUpdating] = useState(false);

  // Quick Status Change Handler
  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus);
    setUpdating(true);
    await updateLead(lead.id, { ...lead, status: newStatus });
    setUpdating(false);
    if (onLeadUpdated) onLeadUpdated();
  };

  // Delete Handler
  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete lead "${lead.name}"?`)) {
      await deleteLead(lead.id);
      if (onLeadUpdated) onLeadUpdated();
      onBack();
    }
  };

  // Format currency value in INR (₹)
  const formattedValue = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(lead.value || 0);

  const getCleanPhoneForWhatsApp = (phoneStr) => {
    if (!phoneStr) return '';
    const cleaned = phoneStr.replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.length === 10) return '91' + cleaned;
    if (cleaned.length === 11 && cleaned.startsWith('0')) return '91' + cleaned.slice(1);
    return cleaned;
  };
  const cleanPhone = getCleanPhoneForWhatsApp(lead.phone);

  return (
    <div className="lead-details-page">
      {/* Back Button */}
      <button className="back-btn-row" onClick={onBack}>
        <ArrowLeft size={18} />
        <span>Back to Leads</span>
      </button>

      {/* Main Details Card */}
      <div className="details-card">
        <div className="details-header-block">
          <div>
            <h2>{lead.name}</h2>
            {lead.company && <p className="details-company">{lead.company}</p>}
          </div>
          <span className={`status-badge ${status}`}>{status}</span>
        </div>

        {/* Change Status Dropdown */}
        <div className="detail-field">
          <label className="detail-label">Update Stage / Status</label>
          <select 
            className="status-selector" 
            value={status} 
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updating}
          >
            <option value="New">New</option>
            <option value="Contacted">Contacted</option>
            <option value="In Progress">In Progress</option>
            <option value="Won">Won</option>
            <option value="Lost">Lost</option>
          </select>
        </div>

        {/* Quick Action Touch Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="action-btn call" style={{ padding: '12px' }}>
              <Phone size={16} />
              <span>Call</span>
            </a>
          )}
          {lead.phone && (
            <a 
              href={`https://wa.me/${cleanPhone}`} 
              target="_blank" 
              rel="noreferrer" 
              className="action-btn whatsapp"
              style={{ padding: '12px' }}
            >
              <MessageCircle size={16} />
              <span>WhatsApp</span>
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="action-btn email" style={{ padding: '12px' }}>
              <Mail size={16} />
              <span>Email</span>
            </a>
          )}
        </div>

        {/* Info Grid */}
        <div className="detail-field">
          <span className="detail-label">Phone Number</span>
          <span className="detail-val">{lead.phone || 'N/A'}</span>
        </div>

        <div className="detail-field">
          <span className="detail-label">Email Address</span>
          <span className="detail-val">{lead.email || 'N/A'}</span>
        </div>

        <div className="detail-field">
          <span className="detail-label">Expected Deal Value</span>
          <span className="detail-val" style={{ color: '#166534' }}>{formattedValue}</span>
        </div>

        <div className="detail-field">
          <span className="detail-label">Lead Source</span>
          <span className="detail-val">{lead.source || 'Direct'}</span>
        </div>

        {lead.notes && (
          <div className="detail-field">
            <span className="detail-label">Notes</span>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: '1.4' }}>{lead.notes}</p>
          </div>
        )}

        {/* Delete Button */}
        <button className="delete-btn" onClick={handleDelete}>
          <Trash2 size={18} />
          <span>Delete Lead</span>
        </button>
      </div>
    </div>
  );
}
