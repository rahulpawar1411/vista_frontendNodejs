// ====================================================================
// Add Lead Page Component (src/pages/AddLead/AddLead.jsx)
// Paired with: src/pages/AddLead/AddLead.css
// Form screen for creating a new sales lead.
// ====================================================================

import React, { useState } from 'react';
import { Save, CheckCircle } from 'lucide-react';
import { createLead } from '../../services/api';
import './AddLead.css'; // Paired CSS file

/**
 * WHAT: Form to create a new sales lead in the CRM.
 * WHY: New inquiries must be stored in MySQL, not only on paper.
 * HOW: Validates fields and POST createLead; returns to leads list on success.
 */
export default function AddLead({ setActiveTab }) {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    status: 'New',
    source: 'Website',
    value: '',
    notes: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [leadPhoneCountryCode, setLeadPhoneCountryCode] = useState('+91');

  // Handle input change
  const handleChange = (e) => {
    let { name, value } = e.target;

    // 1. Phone number (Allow only digits, restrict length dynamically)
    if (name === 'phone') {
      const digits = value.replace(/\D/g, '');
      const maxDigits = (leadPhoneCountryCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(leadPhoneCountryCode) ? 9 : (leadPhoneCountryCode === '+65' ? 8 : 10));
      value = digits.slice(0, maxDigits);
    }
    // 2. Integer/Numeric fields (Value)
    else if (name === 'value') {
      value = value.replace(/\D/g, '');
    }
    // 3. Text-only Name fields (letters, spaces, dots, dashes)
    else if (name.toLowerCase().includes('name')) {
      value = value.replace(/[^a-zA-Z\s\.\-]/g, '');
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Please fill in required fields: Name & Phone Number.');
      return;
    }

    if (formData.phone) {
      const digits = formData.phone.replace(/\D/g, '');
      const expectedDigits = (leadPhoneCountryCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(leadPhoneCountryCode) ? 9 : (leadPhoneCountryCode === '+65' ? 8 : 10));
      if (digits.length < expectedDigits) {
        alert(`⚠️ Invalid Phone Number:\nPlease enter a valid ${expectedDigits}-digit mobile number for country code ${leadPhoneCountryCode}.`);
        return;
      }
    }

    setSubmitting(true);
    const finalPhone = formData.phone ? `${leadPhoneCountryCode} ${formData.phone}` : '';
    const res = await createLead({
      ...formData,
      phone: finalPhone
    });
    setSubmitting(false);

    if (res.success) {
      setSuccessMessage('Lead successfully saved!');
      setTimeout(() => {
        setActiveTab('leads');
      }, 1000);
    }
  };

  return (
    <div className="add-lead-page">
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Add New Lead</h2>

      {successMessage && (
        <div style={{
          backgroundColor: '#dcfce7',
          color: '#15803d',
          padding: '12px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          <CheckCircle size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      <form className="form-card" onSubmit={handleSubmit}>
        {/* Full Name */}
        <div className="form-group">
          <label>Lead Full Name *</label>
          <input 
            type="text" 
            name="name"
            className="form-input" 
            placeholder="e.g. Ramesh Verma" 
            value={formData.name}
            onChange={handleChange}
            required 
          />
        </div>

        {/* Company Name */}
        <div className="form-group">
          <label>Company / Business Name</label>
          <input 
            type="text" 
            name="company"
            className="form-input" 
            placeholder="e.g. Apex Cold Storage" 
            value={formData.company}
            onChange={handleChange}
          />
        </div>

        {/* 2 Column Row: Phone & Email */}
        <div className="form-row-2">
          <div className="form-group">
            <label>Phone Number *</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={leadPhoneCountryCode}
                onChange={(e) => {
                  const newCode = e.target.value;
                  setLeadPhoneCountryCode(newCode);
                  const maxDigits = (newCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(newCode) ? 9 : (newCode === '+65' ? 8 : 10));
                  setFormData(prev => ({
                    ...prev,
                    phone: (prev.phone || '').replace(/\D/g, '').slice(0, maxDigits)
                  }));
                }}
                style={{ width: '90px', padding: '8px 4px', fontSize: '0.85rem', border: '1px solid #ccc', borderRadius: '4px', background: 'var(--surface)', color: 'inherit' }}
              >
                <option value="+91">+91 (IN)</option>
                <option value="+1">+1 (US)</option>
                <option value="+44">+44 (UK)</option>
                <option value="+971">+971 (AE)</option>
                <option value="+966">+966 (SA)</option>
                <option value="+65">+65 (SG)</option>
                <option value="+61">+61 (AU)</option>
                <option value="+92">+92 (PK)</option>
                <option value="+880">+880 (BD)</option>
                <option value="+977">+977 (NP)</option>
              </select>
              <input 
                type="text" 
                name="phone"
                className="form-input" 
                placeholder="98765 43210" 
                value={formData.phone}
                onChange={handleChange}
                required 
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              name="email"
              className="form-input" 
              placeholder="name@email.com" 
              value={formData.email}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* 2 Column Row: Status & Source */}
        <div className="form-row-2">
          <div className="form-group">
            <label>Status</label>
            <select name="status" className="form-select" value={formData.status} onChange={handleChange}>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="In Progress">In Progress</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
          </div>

          <div className="form-group">
            <label>Source</label>
            <select name="source" className="form-select" value={formData.source} onChange={handleChange}>
              <option value="Website">Website</option>
              <option value="Referral">Referral</option>
              <option value="Cold Call">Cold Call</option>
              <option value="Social Media">Social Media</option>
            </select>
          </div>
        </div>

        {/* Expected Deal Value */}
        <div className="form-group">
          <label>Expected Value (INR ₹)</label>
          <input 
            type="text" 
            inputMode="numeric"
            name="value"
            className="form-input" 
            placeholder="e.g. 50000" 
            value={formData.value}
            onChange={handleChange}
          />
        </div>

        {/* Notes */}
        <div className="form-group">
          <label>Notes / Requirements</label>
          <textarea 
            name="notes"
            rows="3"
            className="form-textarea" 
            placeholder="Add details about lead interest, follow-up dates..." 
            value={formData.notes}
            onChange={handleChange}
          ></textarea>
        </div>

        {/* Submit Button */}
        <button type="submit" className="submit-btn" disabled={submitting}>
          <Save size={18} />
          <span>{submitting ? 'Saving...' : 'Save Lead'}</span>
        </button>
      </form>
    </div>
  );
}
