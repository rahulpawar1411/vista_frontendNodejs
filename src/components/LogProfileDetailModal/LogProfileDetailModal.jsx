import React, { useState } from 'react';
import { History, X, Download, ArrowLeft } from 'lucide-react';
import {
  formatDateStr,
  formatDateTimeStr,
  formatDuration,
  formatQty,
  getUpdateDiff,
  resolveImageSrc
} from './logProfileHelpers';
import CopyableRef from './CopyableRef';
import PhotoGpsLink from '../PhotoGpsLink/PhotoGpsLink';
import PhotoCaptureMetaPanel from '../PhotoCaptureMetaPanel/PhotoCaptureMetaPanel';
import FallbackImg from '../FallbackImg/FallbackImg';
import './LogProfileDetailModal.css';

function ProfileField({ label, value, span2, valueStyle, valueClassName, copyable }) {
  const display =
    copyable && value != null && value !== '' && value !== '-'
      ? <CopyableRef value={value} className="profile-value-copyable" />
      : (value ?? '-');
  return (
    <div className="profile-item" style={span2 ? { gridColumn: 'span 2' } : undefined}>
      <span className="profile-label">{label}</span>
      <span
        className={`profile-value${valueClassName ? ` ${valueClassName}` : ''}`}
        style={valueStyle}
      >
        {display}
      </span>
    </div>
  );
}

function PhotoCard({ src, label, onZoom }) {
  if (!src || !String(src).trim()) return null;
  return (
    <div
      className="profile-photo-card"
      onClick={() => onZoom(resolveImageSrc(src))}
      role="button"
      tabIndex={0}
    >
      <div className="profile-photo-wrapper">
        <FallbackImg src={src} alt={label} loading="lazy" />
      </div>
      <div className="profile-photo-label">{label}</div>
    </div>
  );
}

function expandMultiPhotos(src, baseLabel) {
  if (!src) return [];
  const parts = String(src).split(',').map((p) => p.trim()).filter(Boolean);
  return parts.map((part, idx) => ({
    src: part,
    label: parts.length === 1 ? baseLabel : `${baseLabel} #${idx + 1}`
  }));
}

function renderInwardPhotos(log, onZoom) {
  const items = [
    ...expandMultiPhotos(log.inward_invoice_photos, 'Invoice Photo'),
    { src: log.inward_pod_photo, label: 'POD Photo' },
    { src: log.inward_vehicle_seal_photo, label: 'Vehicle Seal' },
    { src: log.inward_vehicle_temp_photo, label: 'Vehicle Temp' },
    { src: log.inward_material_temp_photo, label: 'Material Temp' },
    { src: log.inward_vehicle_back_side_photo, label: 'Vehicle Back' },
    { src: log.inward_vehicle_back_side_photo_with_material, label: 'Vehicle Loaded' },
    ...expandMultiPhotos(log.inward_count_sheet_photo, 'Count Sheet')
  ];
  const damage = expandMultiPhotos(log.inward_damage_boxes_photo, 'Damage Box').map((item, idx, arr) => ({
    ...item,
    label: arr.length === 1 ? 'Damage Box' : `Damage #${idx + 1}`
  }));
  return (
    <>
      {items.map(({ src, label }, idx) => (
        <PhotoCard key={`${label}-${idx}`} src={src} label={label} onZoom={onZoom} />
      ))}
      {damage.map(({ src, label }, idx) => (
        <PhotoCard key={`dmg-${idx}`} src={src} label={label} onZoom={onZoom} />
      ))}
    </>
  );
}

function renderOutwardPhotos(log, onZoom) {
  const items = [
    ...expandMultiPhotos(log.outward_invoice_photos, 'Invoice Photo'),
    { src: log.outward_pod_photo, label: 'POD Photo' },
    { src: log.outward_vehicle_seal_photo, label: 'Vehicle Seal' },
    { src: log.outward_pre_vehicle_temp_photo, label: 'Pre-Cooling Temp' },
    { src: log.outward_vehicle_temp_photo, label: 'Vehicle Temp' },
    { src: log.outward_material_temp_photo, label: 'Material Temp' },
    { src: log.outward_vehicle_back_side_photo, label: 'Vehicle Back' },
    { src: log.outward_vehicle_back_side_photo_with_material, label: 'Vehicle Loaded' },
    ...expandMultiPhotos(log.outward_count_sheet_photo, 'Count Sheet')
  ];
  const damage = expandMultiPhotos(log.outward_damage_boxes_photo, 'Damage Box').map((item, idx, arr) => ({
    ...item,
    label: arr.length === 1 ? 'Damage Box' : `Damage #${idx + 1}`
  }));
  return (
    <>
      {items.map(({ src, label }, idx) => (
        <PhotoCard key={`${label}-${idx}`} src={src} label={label} onZoom={onZoom} />
      ))}
      {damage.map(({ src, label }, idx) => (
        <PhotoCard key={`odmg-${idx}`} src={src} label={label} onZoom={onZoom} />
      ))}
    </>
  );
}

function hasPhotos(log, detailType) {
  if (detailType === 'daily') return !!log.temp_sensor_image;
  if (detailType === 'inward') {
    return !!(
      log.inward_invoice_photos ||
      log.inward_pod_photo ||
      log.inward_vehicle_seal_photo ||
      log.inward_vehicle_temp_photo ||
      log.inward_material_temp_photo ||
      log.inward_vehicle_back_side_photo ||
      log.inward_vehicle_back_side_photo_with_material ||
      log.inward_count_sheet_photo ||
      log.inward_damage_boxes_photo
    );
  }
  return !!(
    log.outward_invoice_photos ||
    log.outward_pod_photo ||
    log.outward_vehicle_seal_photo ||
    log.outward_vehicle_temp_photo ||
    log.outward_pre_vehicle_temp_photo ||
    log.outward_material_temp_photo ||
    log.outward_vehicle_back_side_photo ||
    log.outward_vehicle_back_side_photo_with_material ||
    log.outward_count_sheet_photo ||
    log.outward_damage_boxes_photo
  );
}

export default function LogProfileDetailModal({
  log,
  detailType,
  onClose,
  operatorEmailRenderer,
  fullScreen = false
}) {
  const [lightboxImg, setLightboxImg] = useState(null);

  if (!log) return null;

  const refLabel =
    log.reference_no ||
    `ID: ${log.id || log.inward_id || log.outward_id}`;

  const showOperator = operatorEmailRenderer || ((email) => email || '-');

  const created =
    log.created_at || log.inward_created_at || log.outward_created_at;
  const updated =
    log.updated_at || log.inward_updated_at || log.outward_updated_at;

  const remarks =
    log.remarks || log.inward_remarks || log.outward_remarks;

  const profileBody = (
    <div className="profile-modal-body">
            <div className="profile-details-section">
              <div className="profile-group-card">
                <div className="profile-group-title">Metadata & Warehouse</div>
                <div className="profile-grid-list">
                  <ProfileField label="Warehouse Facility" value={log.warehouse_name || '-'} />
                  <ProfileField label="Recorded By Operator" value={showOperator(log.operator_email)} />
                  <ProfileField label="Created Time" value={formatDateTimeStr(created)} />
                  <ProfileField
                    label="Last Updated Time"
                    value={
                      getUpdateDiff(created, updated) ? formatDateTimeStr(updated) : '-'
                    }
                    valueStyle={
                      getUpdateDiff(created, updated)
                        ? { color: '#0284c7', fontWeight: 800 }
                        : undefined
                    }
                  />
                  {(Number(log.update_count) > 0 || log.update_details) && (
                    <ProfileField
                      label="Last Updated Details"
                      span2
                      value={`Changed ${Number(log.update_count) > 0 ? log.update_count : 1} ${Number(log.update_count) === 1 ? 'time' : 'times'}`}
                      valueStyle={{ fontWeight: 800, color: 'var(--primary)' }}
                    />
                  )}
                  {remarks ? (
                    <ProfileField label="Remarks" span2 value={remarks} valueClassName="profile-value-remarks" />
                  ) : null}
                </div>
              </div>

              {detailType === 'daily' && (
                <>
                  <div className="profile-group-card">
                    <div className="profile-group-title">General Information</div>
                    <div className="profile-grid-list">
                      <ProfileField label="Date" value={formatDateStr(log.formatted_date || log.entry_date)} />
                      <ProfileField label="Reference No" value={log.reference_no || '-'} copyable />
                      <ProfileField label="Chamber Name" value={`${log.chamber_name} (${log.chamber_type || 'Frozen'})`} />
                      <ProfileField label="Client Name" value={log.client_name} />
                    </div>
                  </div>
                  <div className="profile-group-card">
                    <div className="profile-group-title">Temperature & Supervisor</div>
                    <div className="profile-grid-list">
                      <ProfileField label="Box Temp" value={`${log.box_temp}°C`} />
                      <ProfileField label="Box Count" value={log.box_count !== null ? log.box_count : '-'} />
                      <ProfileField label="Inspection Time" value={log.inspection_time || '-'} />
                      <ProfileField label="Supervisor Name" value={log.monitor_supervisor_name || '-'} />
                      <ProfileField
                        label="Time Variance"
                        value={
                          log.time_variance_minutes !== undefined
                            ? `${log.time_variance_minutes} mins`
                            : '-'
                        }
                      />
                      <ProfileField label="Photo Capture Time" value={log.photo_capture_time || '-'} />
                      <ProfileField
                        label="Photo Location (GPS)"
                        value={
                          <PhotoGpsLink
                            lat={log.photo_capture_latitude}
                            lng={log.photo_capture_longitude}
                            accuracy={log.photo_capture_accuracy}
                          />
                        }
                      />
                      <ProfileField label="Submission Delay (Overdue)" value={log.overdue_time || 'same day'} />
                    </div>
                  </div>
                </>
              )}

              {detailType === 'inward' && (
                <>
                  <div className="profile-group-card">
                    <div className="profile-group-title">Vehicle & General Information</div>
                    <div className="profile-grid-list">
                      <ProfileField label="Date" value={formatDateStr(log.inward_entry_date)} />
                      <ProfileField label="Reference No" value={log.reference_no || '-'} copyable />
                      <ProfileField label="Vehicle Number" value={log.inward_vehicle_no} />
                      <ProfileField label="Client Name" value={log.inward_client_name} />
                      <ProfileField label="Dock Number" value={log.inward_dock_no || '-'} />
                      <ProfileField label="Seal Number" value={log.inward_seal_no || '-'} />
                      <ProfileField label="Invoice No." value={log.inward_invoice_no || '-'} />
                      <ProfileField label="Mens Power" value={log.inward_mens_power ?? '-'} />
                    </div>
                  </div>
                  <div className="profile-group-card">
                    <div className="profile-group-title">Temperature & Logistics</div>
                    <div className="profile-grid-list">
                      <ProfileField
                        label="Vehicle Temp"
                        value={
                          log.inward_vehicle_temp != null ? `${log.inward_vehicle_temp}°C` : '-'
                        }
                      />
                      <ProfileField
                        label="Material Temp"
                        value={
                          log.inward_material_temp != null ? `${log.inward_material_temp}°C` : '-'
                        }
                      />
                      <ProfileField label="Pallets In" value={formatQty(log.inward_pallets_in_qty)} />
                      <ProfileField label="Material Type" value={log.inward_material_type || '-'} />
                      <ProfileField
                        label="Supervisor"
                        value={log.inward_unloading_supervisor_name || '-'}
                      />
                      <ProfileField
                        label="Invoice / Received Qty"
                        value={`${formatQty(log.inward_invoice_qty)} / ${formatQty(log.inward_received_qty)}`}
                      />
                      <ProfileField
                        label="Received Boxes"
                        value={formatQty(log.inward_received_boxes_qty)}
                      />
                      <ProfileField
                        label="Damage Boxes"
                        value={formatQty(log.inward_damage_received_boxes_qty)}
                      />
                    </div>
                  </div>
                  <div className="profile-group-card">
                    <div className="profile-group-title">Driver & Timing</div>
                    <div className="profile-grid-list">
                      <ProfileField label="Transporter" value={log.inward_transporter_name || '-'} />
                      <ProfileField label="Driver Name" value={log.inward_driver_name || '-'} />
                      <ProfileField label="Driver Phone" value={log.inward_driver_no || '-'} />
                      <ProfileField
                        label="Reporting Time"
                        value={log.inward_vehicle_reporting_time || '-'}
                      />
                      <ProfileField
                        label="Unloading Duration"
                        value={
                          <>
                            <strong>
                              {formatDuration(
                                log.inward_unloading_duration_hours,
                                log.inward_unloading_duration_mins
                              )}
                            </strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              <div>S: {log.inward_unloading_start_time || '-'}</div>
                              <div>E: {log.inward_unloading_end_time || '-'}</div>
                            </div>
                          </>
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {detailType === 'outward' && (
                <>
                  <div className="profile-group-card">
                    <div className="profile-group-title">Vehicle & General Information</div>
                    <div className="profile-grid-list">
                      <ProfileField label="Date" value={formatDateStr(log.outward_entry_date)} />
                      <ProfileField label="Reference No" value={log.reference_no || '-'} copyable />
                      <ProfileField label="Vehicle Number" value={log.outward_vehicle_no} />
                      <ProfileField label="Client Name" value={log.outward_client_name} />
                      <ProfileField label="Dock Number" value={log.outward_dock_no || '-'} />
                      <ProfileField label="Seal Number" value={log.outward_seal_no || '-'} />
                      <ProfileField label="Invoice No." value={log.outward_invoice_no || '-'} />
                      <ProfileField label="Mens Power" value={log.outward_mens_power ?? '-'} />
                    </div>
                  </div>
                  <div className="profile-group-card">
                    <div className="profile-group-title">Temperature & Logistics</div>
                    <div className="profile-grid-list">
                      <ProfileField
                        label="Pre-Cooling Temp"
                        value={
                          log.outward_pre_vehicle_temp != null
                            ? `${log.outward_pre_vehicle_temp}°C`
                            : '-'
                        }
                      />
                      <ProfileField
                        label="Loading Temp"
                        value={
                          log.outward_vehicle_temp != null ? `${log.outward_vehicle_temp}°C` : '-'
                        }
                      />
                      <ProfileField
                        label="Material Temp"
                        value={
                          log.outward_material_temp != null ? `${log.outward_material_temp}°C` : '-'
                        }
                      />
                      <ProfileField label="Pallets Out" value={formatQty(log.outward_pallets_in_qty)} />
                      <ProfileField label="Material Type" value={log.outward_material_type || '-'} />
                      <ProfileField
                        label="Loading Supervisor"
                        value={log.outward_loading_supervisor_name || '-'}
                      />
                      <ProfileField
                        label="Invoice / Loaded Qty"
                        value={`${formatQty(log.outward_invoice_qty)} / ${formatQty(log.outward_received_qty)}`}
                      />
                      <ProfileField
                        label="Loaded Boxes"
                        value={formatQty(log.outward_received_boxes_qty)}
                      />
                      <ProfileField
                        label="Damage Boxes"
                        value={formatQty(log.outward_damage_received_boxes_qty)}
                      />
                    </div>
                  </div>
                  <div className="profile-group-card">
                    <div className="profile-group-title">Driver & Timing</div>
                    <div className="profile-grid-list">
                      <ProfileField label="Transporter" value={log.outward_transporter_name || '-'} />
                      <ProfileField label="Driver Name" value={log.outward_driver_name || '-'} />
                      <ProfileField label="Driver Phone" value={log.outward_driver_no || '-'} />
                      <ProfileField
                        label="Loading Duration"
                        value={
                          <>
                            <strong>
                              {formatDuration(
                                log.outward_loading_duration_hours,
                                log.outward_loading_duration_mins
                              )}
                            </strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              <div>S: {log.outward_loading_start_time || '-'}</div>
                              <div>E: {log.outward_loading_end_time || '-'}</div>
                            </div>
                          </>
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {(detailType === 'inward' || detailType === 'outward') && (
                <PhotoCaptureMetaPanel metadata={log.photo_capture_metadata} />
              )}
            </div>

            <div className="profile-photos-section">
              <h4>Uploaded Audit Attachment Photos</h4>
              {hasPhotos(log, detailType) ? (
                <div className="profile-photo-grid">
                  {detailType === 'daily' && (
                    <PhotoCard
                      src={log.temp_sensor_image}
                      label="Temp Sensor"
                      onZoom={setLightboxImg}
                    />
                  )}
                  {detailType === 'inward' && renderInwardPhotos(log, setLightboxImg)}
                  {detailType === 'outward' && renderOutwardPhotos(log, setLightboxImg)}
                </div>
              ) : (
                <div className="log-profile-no-photos">
                  No audit attachment photos uploaded for this record.
                </div>
              )}
            </div>
          </div>
  );

  const lightbox = lightboxImg && (
    <div className="lightbox-overlay" onClick={() => setLightboxImg(null)} role="presentation">
      <div
        className="lightbox-controls"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <a
          href={lightboxImg && lightboxImg.includes('res.cloudinary.com') ? lightboxImg.replace('/upload/', '/upload/fl_attachment/') : lightboxImg}
          download={`Audit_${Date.now()}.jpg`}
          title="Download"
          className="lightbox-download-btn"
        >
          <Download size={20} />
        </a>
        <button type="button" className="lightbox-close-btn" onClick={() => setLightboxImg(null)}>
          <X size={22} />
        </button>
      </div>
      <img src={lightboxImg} alt="Attachment preview" className="lightbox-image" />
    </div>
  );

  if (fullScreen) {
    return (
      <>
        <div className="log-profile-fullscreen">
          <header className="log-profile-fullscreen-header">
            <button type="button" className="log-profile-back-btn" onClick={onClose}>
              <ArrowLeft size={18} />
              Back
            </button>
            <h2 className="log-profile-fullscreen-title">
              <History size={20} color="var(--primary)" />
              <span className="log-profile-title-line">
                Log Details:{' '}
                {log.reference_no ? (
                  <CopyableRef value={log.reference_no} className="log-profile-title-ref" />
                ) : (
                  refLabel
                )}
              </span>
            </h2>
          </header>
          <div className="log-profile-fullscreen-scroll">{profileBody}</div>
        </div>
        {lightbox}
      </>
    );
  }

  return (
    <>
      <div className="profile-modal-overlay" onClick={onClose}>
        <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="profile-modal-header">
            <h3>
              <History size={20} color="var(--primary)" />
              <span className="log-profile-title-line">
                Log Details:{' '}
                {log.reference_no ? (
                  <CopyableRef value={log.reference_no} className="log-profile-title-ref" />
                ) : (
                  refLabel
                )}
              </span>
            </h3>
            <button type="button" className="profile-modal-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          {profileBody}

          <div className="profile-modal-footer">
            <button type="button" className="profile-close-btn" onClick={onClose}>
              Close View
            </button>
          </div>
        </div>
      </div>
      {lightbox}
    </>
  );
}
