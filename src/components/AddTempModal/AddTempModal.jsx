// ====================================================================
// Add Temp Modal Component (src/components/AddTempModal/AddTempModal.jsx)
// Paired with: src/components/AddTempModal/AddTempModal.css
// DO Thermal Log Entry Form with Inward/Outward preset options.
// ====================================================================

import React, { useState, useEffect } from 'react';
import { X, Thermometer, Save, Truck, User, ShieldCheck, Zap } from 'lucide-react';
import { createTempLog } from '../../services/api';
import './AddTempModal.css'; // Paired CSS file

/**
 * WHAT: Popup form to add a legacy temp log (Inward/Outward type).
 * WHY: Older sales temp monitor path still uses simple JSON logs.
 * HOW: createTempLog API; onLogAdded refreshes list; onClose dismisses modal.
 */
export default function AddTempModal({ defaultType = 'Inward', onClose, onLogAdded }) {
  const [formData, setFormData] = useState({
    entry_type: defaultType,
    container_number: '',
    client_name: '',
    cargo_type: 'Frozen Poultry / Meat',
    target_temp: '-18.0',
    actual_temp: '-17.5',
    location_dock: defaultType === 'Inward' ? 'Dock Bay 1' : 'Dispatch Gate 1',
    driver_name: '',
    driver_phone: '',
    seal_number: '',
    genset_status: 'Running',
    fuel_level: '100%',
    operator_name: 'Rakesh (DO)',
    remarks: ''
  });

  useEffect(() => {
    if (defaultType) {
      setFormData(prev => ({
        ...prev,
        entry_type: defaultType,
        location_dock: defaultType === 'Inward' ? 'Dock Bay 1' : 'Dispatch Gate 1'
      }));
    }
  }, [defaultType]);

  const [submitting, setSubmitting] = useState(false);
  const [driverPhoneCountryCode, setDriverPhoneCountryCode] = useState('+91');

  const handleChange = (e) => {
    let { name, value } = e.target;

    // 1. Phone number (Allow only digits, restrict length dynamically)
    if (name === 'driver_phone') {
      const digits = value.replace(/\D/g, '');
      const maxDigits = (driverPhoneCountryCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(driverPhoneCountryCode) ? 9 : (driverPhoneCountryCode === '+65' ? 8 : 10));
      value = digits.slice(0, maxDigits);
    }
    // 2. Float/Decimal fields (Temperatures)
    else if (['target_temp', 'actual_temp'].includes(name)) {
      // Allow only digits, dot, and minus sign
      let clean = value.replace(/[^\d\.\-]/g, '');
      if (clean.includes('-')) {
        const parts = clean.split('-');
        clean = (clean.startsWith('-') ? '-' : '') + parts.join('');
      }
      if (clean.includes('.')) {
        const parts = clean.split('.');
        clean = parts[0] + '.' + parts.slice(1).join('');
      }
      value = clean;
    }
    // 3. Text-only Name fields (letters, spaces, dots, dashes)
    else if (name.toLowerCase().includes('name')) {
      value = value.replace(/[^a-zA-Z\s\.\-]/g, '');
    }
    // 4. Container / Seal number (uppercase)
    else if (['container_number', 'seal_number'].includes(name)) {
      value = value.toUpperCase();
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const applyPreset = (target, cargo) => {
    setFormData(prev => ({ 
      ...prev, 
      target_temp: target.toString(), 
      actual_temp: (parseFloat(target) + 0.5).toString(),
      cargo_type: cargo || prev.cargo_type
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.container_number || !formData.client_name) {
      alert('Please enter Container / Vehicle Number and Client Name.');
      return;
    }

    if (formData.driver_phone) {
      const digits = formData.driver_phone.replace(/\D/g, '');
      const expectedDigits = (driverPhoneCountryCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(driverPhoneCountryCode) ? 9 : (driverPhoneCountryCode === '+65' ? 8 : 10));
      if (digits.length < expectedDigits) {
        alert(`⚠️ Invalid Phone Number:\nPlease enter a valid ${expectedDigits}-digit mobile number for country code ${driverPhoneCountryCode}.`);
        return;
      }
    }

    setSubmitting(true);
    const finalPhone = formData.driver_phone ? `${driverPhoneCountryCode} ${formData.driver_phone}` : '';
    const res = await createTempLog({
      ...formData,
      driver_phone: finalPhone
    });
    setSubmitting(false);

    if (res.success) {
      if (onLogAdded) onLogAdded();
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* Header */}
        <div className="modal-header">
          <h3>
            <Thermometer size={20} color="#00a2e8" />
            <span>Log {formData.entry_type} Thermal Inspection</span>
          </h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Form Grid */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="do-form-grid">
            {/* Movement Type */}
            <div className="form-group">
              <label><Truck size={14} /> Shipment Movement *</label>
              <select 
                name="entry_type" 
                className="form-select" 
                value={formData.entry_type} 
                onChange={handleChange}
              >
                <option value="Inward">📥 Inward (Receiving Dock)</option>
                <option value="Outward">📤 Outward (Dispatch Gate)</option>
              </select>
            </div>

            {/* Container / Vehicle Number */}
            <div className="form-group">
              <label>Reefer Container / Vehicle No *</label>
              <input 
                type="text" 
                name="container_number"
                className="form-input" 
                placeholder="e.g. RF-IN-2041 or MH-12-AB-9876" 
                value={formData.container_number}
                onChange={handleChange}
                required
              />
            </div>

            {/* Client Name */}
            <div className="form-group">
              <label>Client / Party Name *</label>
              <input 
                type="text" 
                name="client_name"
                className="form-input" 
                placeholder="e.g. Fresh Agro Supplies" 
                value={formData.client_name}
                onChange={handleChange}
                required
              />
            </div>

            {/* Cargo Description */}
            <div className="form-group">
              <label>Cargo / Commodity Type</label>
              <input 
                type="text" 
                name="cargo_type"
                className="form-input" 
                placeholder="e.g. Frozen Meat, Ice Cream, Pharma" 
                value={formData.cargo_type}
                onChange={handleChange}
              />
            </div>

            {/* Target Set Point Temp (°C) */}
            <div className="form-group">
              <label><Thermometer size={14} /> Target Set Point Temp (°C) *</label>
              <input 
                type="text" 
                inputMode="decimal"
                name="target_temp"
                className="form-input" 
                placeholder="-18.0" 
                value={formData.target_temp}
                onChange={handleChange}
                required
              />
              <div className="temp-presets-row">
                <button type="button" className="preset-btn" onClick={() => applyPreset('-22.0', 'Ice Cream')}>-22°C Deep Freeze</button>
                <button type="button" className="preset-btn" onClick={() => applyPreset('-18.0', 'Frozen Foods')}>-18°C Frozen</button>
                <button type="button" className="preset-btn" onClick={() => applyPreset('2.0', 'Chill Products')}>+2°C Chill</button>
                <button type="button" className="preset-btn" onClick={() => applyPreset('5.0', 'Pharma Vaccines')}>+5°C Pharma</button>
              </div>
            </div>

            {/* Actual Measured Temp (°C) */}
            <div className="form-group">
              <label><Thermometer size={14} /> Actual Measured Temp (°C) *</label>
              <input 
                type="text" 
                inputMode="decimal"
                name="actual_temp"
                className="form-input" 
                placeholder="-17.5" 
                value={formData.actual_temp}
                onChange={handleChange}
                required
              />
            </div>

            {/* Dock / Bay Location */}
            <div className="form-group">
              <label>Dock / Bay Location</label>
              <select 
                name="location_dock" 
                className="form-select" 
                value={formData.location_dock} 
                onChange={handleChange}
              >
                <option value="Dock Bay 1">Dock Bay 1</option>
                <option value="Dock Bay 2">Dock Bay 2</option>
                <option value="Dock Bay 3">Dock Bay 3</option>
                <option value="Dispatch Gate 1">Dispatch Gate 1</option>
                <option value="Dispatch Gate 2">Dispatch Gate 2</option>
                <option value="Dispatch Gate 3">Dispatch Gate 3</option>
              </select>
            </div>

            {/* Seal Number */}
            <div className="form-group">
              <label><ShieldCheck size={14} /> Seal Number</label>
              <input 
                type="text" 
                name="seal_number"
                className="form-input" 
                placeholder="e.g. SL-884920" 
                value={formData.seal_number}
                onChange={handleChange}
              />
            </div>

            {/* Driver Name */}
            <div className="form-group">
              <label><User size={14} /> Driver Full Name</label>
              <input 
                type="text" 
                name="driver_name"
                className="form-input" 
                placeholder="e.g. Ram Singh" 
                value={formData.driver_name}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Driver Phone Number</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={driverPhoneCountryCode}
                  onChange={(e) => {
                    const newCode = e.target.value;
                    setDriverPhoneCountryCode(newCode);
                    const maxDigits = (newCode === '+91') ? 10 : (['+971', '+966', '+61'].includes(newCode) ? 9 : (newCode === '+65' ? 8 : 10));
                    setFormData(prev => ({
                      ...prev,
                      driver_phone: (prev.driver_phone || '').replace(/\D/g, '').slice(0, maxDigits)
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
                  name="driver_phone"
                  className="form-input" 
                  placeholder="98765 43210" 
                  value={formData.driver_phone}
                  onChange={handleChange}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            {/* Genset / Compressor Status */}
            <div className="form-group">
              <label><Zap size={14} /> Genset / Compressor State</label>
              <select 
                name="genset_status" 
                className="form-select" 
                value={formData.genset_status} 
                onChange={handleChange}
              >
                <option value="Running">🟢 Running Normally</option>
                <option value="OFF">⚪ OFF / Standby</option>
                <option value="Faulty">🚨 Faulty / Compressor Error</option>
              </select>
            </div>

            {/* Fuel / Battery Level */}
            <div className="form-group">
              <label>Genset Fuel Level</label>
              <select 
                name="fuel_level" 
                className="form-select" 
                value={formData.fuel_level} 
                onChange={handleChange}
              >
                <option value="100%">100% Full</option>
                <option value="75%">75%</option>
                <option value="50%">50%</option>
                <option value="25%">25% Low</option>
              </select>
            </div>

            {/* Operator Name */}
            <div className="form-group">
              <label>Data Operator Name</label>
              <input 
                type="text" 
                name="operator_name"
                className="form-input" 
                value={formData.operator_name}
                onChange={handleChange}
              />
            </div>

            {/* Remarks */}
            <div className="form-group full-width">
              <label>DO Operator Remarks / Inspection Notes</label>
              <textarea 
                name="remarks"
                rows="2"
                className="form-textarea" 
                placeholder="Add details about pre-cooling, door seals, defroster status..." 
                value={formData.remarks}
                onChange={handleChange}
              ></textarea>
            </div>
          </div>

          {/* Submit Button */}
          <button type="submit" className="submit-btn" disabled={submitting}>
            <Save size={18} />
            <span>{submitting ? 'Recording Log...' : `Save ${formData.entry_type} Thermal Log`}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
