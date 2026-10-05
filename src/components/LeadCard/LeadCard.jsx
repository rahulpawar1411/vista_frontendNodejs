// ====================================================================
// Lead Card Component (src/components/LeadCard/LeadCard.jsx)
// Paired with: src/components/LeadCard/LeadCard.css
// Mobile-first card component with quick actions for Call, WhatsApp, Email.
// ====================================================================

import React from 'react';
import { Phone, MessageCircle, Mail, Building2, ChevronRight } from 'lucide-react';
import './LeadCard.css'; // Paired CSS file

/**
 * WHAT: One row/card summarizing a sales lead in the list.
 * WHY: Clickable preview before opening full LeadDetails.
 * HOW: Shows name, company, status; onSelect(lead) when user opens details.
 */
export default function LeadCard({ lead, onSelect }) {
  // Format currency value in INR (e.g. ₹45,000)
  const formattedValue = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(lead.value || 0);

  // Clean phone number for WhatsApp link
  const getCleanPhoneForWhatsApp = (phoneStr) => {
    if (!phoneStr) return '';
    const cleaned = phoneStr.replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.length === 10) return '91' + cleaned;
    if (cleaned.length === 11 && cleaned.startsWith('0')) return '91' + cleaned.slice(1);
    return cleaned;
  };
  const cleanPhone = getCleanPhoneForWhatsApp(lead.phone);

  return (
    <div className="lead-card">
      {/* 1. Header Row: Name, Company, Status Badge */}
      <div className="lead-card-header">
        <div className="lead-info-main">
          <h3>{lead.name}</h3>
          {lead.company && (
            <div className="lead-company">
              <Building2 size={13} />
              <span>{lead.company}</span>
            </div>
          )}
        </div>
        
        {/* Status Badge */}
        <span className={`status-badge ${lead.status || 'New'}`}>
          {lead.status || 'New'}
        </span>
      </div>

      {/* 2. Middle Row: Value & Source Tag */}
      <div className="lead-meta-row">
        <span className="lead-value">{formattedValue}</span>
        <span className="lead-source-tag">{lead.source || 'Direct'}</span>
      </div>

      {/* 3. Action Buttons Bar (Phone Call, WhatsApp, Email, Open Details) */}
      <div className="lead-actions-bar">
        {/* Call Button */}
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="action-btn call" title="Call Lead">
            <Phone size={14} />
            <span>Call</span>
          </a>
        )}

        {/* WhatsApp Button */}
        {lead.phone && (
          <a 
            href={`https://wa.me/${cleanPhone}?text=Hi%20${encodeURIComponent(lead.name)},%20following%20up%20from%20Reeferon.`} 
            target="_blank" 
            rel="noreferrer"
            className="action-btn whatsapp"
            title="Chat on WhatsApp"
          >
            <MessageCircle size={14} />
            <span>Chat</span>
          </a>
        )}

        {/* Email Button */}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="action-btn email" title="Send Email">
            <Mail size={14} />
          </a>
        )}

        {/* Details / Edit Trigger */}
        <button className="action-btn details" onClick={() => onSelect(lead)}>
          <span>View</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
