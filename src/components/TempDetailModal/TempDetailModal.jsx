// ====================================================================
// Temp Detail Modal Component (src/components/TempDetailModal/TempDetailModal.jsx)
// Paired with: src/components/TempDetailModal/TempDetailModal.css
// Full thermal inspection report view for Data Operators (DO).
// ====================================================================

import React from 'react';
import { X, Phone, MessageCircle, Printer, ShieldCheck, Truck, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import './TempDetailModal.css'; // Paired CSS file

/**
 * WHAT: Read-only popup showing one legacy temperature log entry.
 * WHY: Quick inspection from sales temp list without leaving the page.
 * HOW: Renders log fields; onClose hides modal (no API writes).
 */
export default function TempDetailModal({ log, onClose }) {
  if (!log) return null;

  const handlePrint = () => {
    window.print();
  };

  const getCleanPhoneForWhatsApp = (phoneStr) => {
    if (!phoneStr) return '';
    const cleaned = phoneStr.replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.length === 10) return '91' + cleaned;
    if (cleaned.length === 11 && cleaned.startsWith('0')) return '91' + cleaned.slice(1);
    return cleaned;
  };
  const cleanDriverPhone = getCleanPhoneForWhatsApp(log.driver_phone);

  return (
    <div className="detail-modal-overlay">
      <div className="detail-modal-card">
        {/* Header */}
        <div className="detail-modal-header">
          <div className="report-title-block">
            <h3>Thermal Inspection Report</h3>
            <p className="report-subtitle">
              Log #{log.id} • Recorded by {log.operator_name || 'DO'} on {new Date(log.recorded_at).toLocaleString()}
            </p>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Temperature Comparison Banner */}
        <div className="temp-comparison-banner">
          <div className="temp-item">
            <label>TARGET SET POINT</label>
            <strong style={{ color: '#38bdf8' }}>{log.target_temp}°C</strong>
          </div>

          <div style={{ fontSize: '1.5rem', color: '#64748b' }}>→</div>

          <div className="temp-item">
            <label>ACTUAL DOCK TEMP</label>
            <strong style={{ color: log.status === 'Critical' ? '#f87171' : log.status === 'Warning' ? '#fbbf24' : '#4ade80' }}>
              {log.actual_temp}°C
            </strong>
          </div>

          <div className="temp-item">
            <label>VARIANCE</label>
            <strong style={{ color: '#ffffff' }}>±{log.temp_variance || Math.abs(log.actual_temp - log.target_temp)}°C</strong>
          </div>
        </div>

        {/* Report Details 2-Column Grid */}
        <div className="report-grid-2">
          <div className="report-field">
            <label>Shipment Movement</label>
            <span>{log.entry_type === 'Inward' ? '📥 Inward (Receiving)' : '📤 Outward (Dispatch)'}</span>
          </div>

          <div className="report-field">
            <label>Reefer Container / Vehicle No</label>
            <span style={{ color: 'var(--primary)' }}>{log.container_number}</span>
          </div>

          <div className="report-field">
            <label>Client / Party Name</label>
            <span>{log.client_name}</span>
          </div>

          <div className="report-field">
            <label>Cargo Description</label>
            <span>{log.cargo_type || 'Cold Cargo'}</span>
          </div>

          <div className="report-field">
            <label>Dock Bay / Location</label>
            <span>{log.location_dock || 'Bay 1'}</span>
          </div>

          <div className="report-field">
            <label>Seal Number Verification</label>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={16} color="#84c225" />
              {log.seal_number || 'SL-NOT-SET'}
            </span>
          </div>

          <div className="report-field">
            <label>Vehicle Driver</label>
            <span>{log.driver_name || 'Driver Not Assigned'} ({log.driver_phone || 'N/A'})</span>
          </div>

          <div className="report-field">
            <label>Genset / Compressor State</label>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={16} color={log.genset_status === 'Faulty' ? '#ef4444' : '#10b981'} />
              {log.genset_status || 'Running'} (Fuel: {log.fuel_level || '100%'})
            </span>
          </div>
        </div>

        {/* Remarks Section */}
        {log.remarks && (
          <div className="report-field" style={{ gridColumn: '1/-1' }}>
            <label>DO Inspection Remarks & Notes</label>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: '1.4', marginTop: '4px' }}>
              {log.remarks}
            </p>
          </div>
        )}

        {/* Driver Communication & Print Buttons Bar */}
        <div className="report-actions-row">
          {log.driver_phone && (
            <a href={`tel:${log.driver_phone}`} className="report-btn call">
              <Phone size={16} />
              <span>Call Driver</span>
            </a>
          )}

          {log.driver_phone && (
            <a 
              href={`https://wa.me/${cleanDriverPhone}?text=ReeferON%20DO%20Alert%20for%20Vehicle%20${encodeURIComponent(log.container_number)}`} 
              target="_blank" 
              rel="noreferrer" 
              className="report-btn whatsapp"
            >
              <MessageCircle size={16} />
              <span>WhatsApp Driver</span>
            </a>
          )}

          <button className="report-btn print" onClick={handlePrint}>
            <Printer size={16} />
            <span>Print Report</span>
          </button>
        </div>
      </div>
    </div>
  );
}
