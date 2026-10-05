// ====================================================================
// Add Chamber Temp Modal Component
// (src/components/AddChamberTempModal/AddChamberTempModal.jsx)
// Paired with: src/components/AddChamberTempModal/AddChamberTempModal.css
// Form Modal to log Date, Client Name, Chamber Name, 11 AM Temp, 06 PM Temp, Monitor Supervisor Name.
// ====================================================================

import React, { useState } from 'react';
import { X, Calendar, User, Thermometer, ShieldCheck } from 'lucide-react';
import { addChamberLog } from '../../services/api';
import './AddChamberTempModal.css'; // Paired CSS file

/**
 * WHAT: Modal shortcut to submit one daily chamber temperature reading.
 * WHY: Sales admin can log a chamber reading without full DO TempMonitor page.
 * HOW: addChamberLog POST; closes on success and calls onLogAdded.
 */
export default function AddChamberTempModal({ onClose, onLogAdded }) {
  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    log_date: todayStr,
    client_name: '',
    chamber_name: 'Chamber 1',
    temp_11am: '',
    temp_6pm: '',
    supervisor_name: '',
    remarks: ''
  });

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.client_name || !formData.supervisor_name) {
      alert('Please enter Client Name and Monitor Supervisor Name.');
      return;
    }

    setSubmitting(true);
    await addChamberLog(formData);
    setSubmitting(false);
    onLogAdded();
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        {/* Header */}
        <div className="modal-header">
          <h3>Log DO Daily Chamber Temperature</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Row 1: Date & Chamber Name */}
            <div className="form-grid-2">
              <div className="form-group">
                <label>Date *</label>
                <input 
                  type="date" 
                  value={formData.log_date}
                  onChange={(e) => setFormData({ ...formData, log_date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Chamber Name *</label>
                <select 
                  value={formData.chamber_name}
                  onChange={(e) => setFormData({ ...formData, chamber_name: e.target.value })}
                  required
                >
                  <option value="Chamber 1">Chamber 1</option>
                  <option value="Chamber 2">Chamber 2</option>
                  <option value="Chamber 3">Chamber 3</option>
                  <option value="Chamber 4">Chamber 4</option>
                  <option value="Blast Freezer 1">Blast Freezer 1</option>
                  <option value="Pre-Cooling Bay">Pre-Cooling Bay</option>
                </select>
              </div>
            </div>

            {/* Row 2: Client Name */}
            <div className="form-group">
              <label>Client Name *</label>
              <input 
                type="text" 
                placeholder="e.g. Amul Ice Creams / Nestlé Cold Chain"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                required
              />
            </div>

            {/* Row 3: 11 AM Temp & 06 PM Temp */}
            <div className="form-grid-2">
              <div className="form-group">
                <label>11 AM Chamber Temp (°C)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  placeholder="e.g. -18.5"
                  value={formData.temp_11am}
                  onChange={(e) => setFormData({ ...formData, temp_11am: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>06 PM Chamber Temp (°C)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  placeholder="e.g. -19.2"
                  value={formData.temp_6pm}
                  onChange={(e) => setFormData({ ...formData, temp_6pm: e.target.value })}
                />
              </div>
            </div>

            {/* Row 4: Monitor Supervisor Name */}
            <div className="form-group">
              <label>Monitor Supervisor Name *</label>
              <input 
                type="text" 
                placeholder="e.g. Rajesh Kumar (Supervisor)"
                value={formData.supervisor_name}
                onChange={(e) => setFormData({ ...formData, supervisor_name: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary-submit" disabled={submitting}>
              {submitting ? 'Saving Log...' : 'Save Temperature Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
