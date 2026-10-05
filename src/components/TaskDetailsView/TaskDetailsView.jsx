/**
 * WHAT: Task Details panel for daily / inward / outward logs (reference UI).
 * WHY: One consistent SA detail layout — metrics, summary, full log, photos, timeline, geo.
 * HOW: detailType switches fields & photos; used inside profile-modal overlay.
 */
import React, { useMemo, useState } from 'react';
import {
  X,
  Edit,
  Trash2,
  ClipboardCheck,
  Thermometer,
  Building2,
  Calendar,
  Package,
  User,
  FileText,
  Camera,
  Settings2,
  CheckCircle2,
  Circle,
  Check,
  MapPin,
  Copy,
  Maximize2,
  Clock,
  LayoutGrid,
  Sun,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  Hash
} from 'lucide-react';
import {
  pickComplianceZone,
  getChamberTempRange,
  getChamberTempDeviation
} from '../../utils/chamberTempCompliance';
import { resolveMediaSrc } from '../../utils/resolveMediaSrc';
import PhotoGpsLink from '../PhotoGpsLink/PhotoGpsLink';
import './TaskDetailsView.css';

function fmtDate(dateVal) {
  if (!dateVal) return '-';
  try {
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) {
      const s = String(dateVal).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, day] = s.split('-');
        return `${day}-${m}-${y}`;
      }
      return String(dateVal);
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  } catch {
    return String(dateVal);
  }
}

function fmtDateTime(val) {
  if (!val) return '-';
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(val);
  }
}

function fmtQty(v) {
  if (v === null || v === undefined || String(v).trim() === '') return '—';
  return String(v);
}

function fmtDuration(hoursStr, minsStr) {
  const h = Number(hoursStr) || 0;
  const m = Number(minsStr) || 0;
  if (!h && !m) return '—';
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh || m ? `${d}d ${rh}h ${m}m` : `${d}d`;
  }
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function resolveShift(shift, inspectionTime, createdAt) {
  const s = String(shift || '').trim();
  if (/morn/i.test(s)) return 'Morning';
  if (/eve/i.test(s)) return 'Evening';
  const t = String(inspectionTime || '').trim();
  if (/am/i.test(t) || /^0?[6-9]:|^1[0-1]:/i.test(t)) return 'Morning';
  if (/pm/i.test(t) || /^1[4-9]:|^2[0-3]:/i.test(t)) return 'Evening';
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) return d.getHours() < 14 ? 'Morning' : 'Evening';
  }
  return 'Morning';
}

function statusFromLog(log) {
  const overdue = String(log.overdue_time || '').trim().toLowerCase();
  if (!overdue || overdue === 'same day' || overdue === '0' || overdue === 'on time') {
    return { label: 'Completed On time', tone: 'ok' };
  }
  if (/late|overdue|delay/i.test(overdue)) {
    return { label: `Late · ${log.overdue_time}`, tone: 'late' };
  }
  return { label: String(log.overdue_time), tone: 'late' };
}

function formatSpanDuration(fromVal, toVal) {
  if (!fromVal || !toVal) return null;
  const from = new Date(fromVal).getTime();
  const to = new Date(toVal).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  const sec = Math.round((to - from) / 1000);
  if (sec < 5) return 'Instant';
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins < 60) return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours < 48) return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

function parseInspectionClock(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const ap = ampm[3].toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return { h, m };
  }
  const h24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    const h = Number(h24[1]);
    const m = Number(h24[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
    return { h, m };
  }
  return null;
}

function computeTimeVarianceMinutes(log) {
  const entryRaw = log.formatted_date || log.entry_date;
  const clock = parseInspectionClock(log.inspection_time);
  const captureRaw = log.photo_capture_time || log.created_at;
  if (!entryRaw || !clock || !captureRaw) return null;

  let year;
  let month;
  let day;
  if (entryRaw instanceof Date) {
    year = entryRaw.getFullYear();
    month = entryRaw.getMonth() + 1;
    day = entryRaw.getDate();
  } else {
    const ymd = String(entryRaw).split('T')[0].slice(0, 10);
    const parts = ymd.split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
    year = parts[0];
    month = parts[1];
    day = parts[2];
  }

  const inspectionDate = new Date(year, month - 1, day, clock.h, clock.m, 0, 0);
  const captureDate =
    typeof captureRaw === 'string'
      ? new Date(captureRaw.includes('T') ? captureRaw : captureRaw.replace(' ', 'T'))
      : new Date(captureRaw);
  if (Number.isNaN(inspectionDate.getTime()) || Number.isNaN(captureDate.getTime())) return null;
  return Math.round(Math.abs(captureDate.getTime() - inspectionDate.getTime()) / (1000 * 60));
}

function formatVarianceMins(mins) {
  if (mins === undefined || mins === null || mins === '') return null;
  const n = Number(mins);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(Math.round(n));
  if (abs === 0) return 'On time (0 min)';
  if (abs < 60) return `${abs} min`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function resolveTimeVarianceMinutes(log) {
  const computed = computeTimeVarianceMinutes(log);
  if (computed != null) return computed;
  const stored = log?.time_variance_minutes;
  if (stored === undefined || stored === null || stored === '') return null;
  const n = Number(stored);
  return Number.isFinite(n) ? n : null;
}

function parsePhotoMeta(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function expandMultiPhotos(src, baseLabel, fieldKey, metaByField) {
  if (!src) return [];
  const parts = String(src)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const fieldMeta = metaByField?.[fieldKey];
  const entries = Array.isArray(fieldMeta) ? fieldMeta : fieldMeta ? [fieldMeta] : [];
  return parts.map((part, idx) => {
    const entry = entries[idx] && typeof entries[idx] === 'object' ? entries[idx] : null;
    const lat = entry?.latitude ?? entry?.lat ?? null;
    const lng = entry?.longitude ?? entry?.lng ?? entry?.lon ?? null;
    const accuracy = entry?.accuracy ?? null;
    const capturedAt = entry?.capturedAt || entry?.captured_at || null;
    const hasGps =
      lat != null &&
      lng != null &&
      String(lat).trim() !== '' &&
      String(lng).trim() !== '' &&
      !Number.isNaN(Number(lat)) &&
      !Number.isNaN(Number(lng));
    return {
      src: part,
      label: parts.length === 1 ? baseLabel : `${baseLabel} #${idx + 1}`,
      meta: 'JPG · Audit',
      lat: hasGps ? lat : null,
      lng: hasGps ? lng : null,
      accuracy: hasGps ? accuracy : null,
      capturedAt: capturedAt || null
    };
  });
}

function collectPhotos(log, type) {
  const metaByField = parsePhotoMeta(log.photo_capture_metadata) || {};
  if (type === 'daily') {
    if (!log.temp_sensor_image) return [];
    const lat = log.photo_capture_latitude;
    const lng = log.photo_capture_longitude;
    const hasGps =
      lat != null &&
      lng != null &&
      String(lat).trim() !== '' &&
      String(lng).trim() !== '' &&
      !Number.isNaN(Number(lat)) &&
      !Number.isNaN(Number(lng));
    return [
      {
        src: log.temp_sensor_image,
        label: 'Temp Sensor',
        meta: 'JPG · Sensor',
        lat: hasGps ? lat : null,
        lng: hasGps ? lng : null,
        accuracy: hasGps ? log.photo_capture_accuracy : null,
        capturedAt: log.photo_capture_time || null
      }
    ];
  }
  if (type === 'inward') {
    return [
      ...expandMultiPhotos(log.inward_invoice_photos, 'Invoice Photo', 'inward_invoice_photos', metaByField),
      ...expandMultiPhotos(log.inward_pod_photo, 'POD Photo', 'inward_pod_photo', metaByField),
      ...expandMultiPhotos(log.inward_vehicle_seal_photo, 'Vehicle Seal', 'inward_vehicle_seal_photo', metaByField),
      ...expandMultiPhotos(log.inward_vehicle_temp_photo, 'Vehicle Temp', 'inward_vehicle_temp_photo', metaByField),
      ...expandMultiPhotos(log.inward_material_temp_photo, 'Material Temp', 'inward_material_temp_photo', metaByField),
      ...expandMultiPhotos(
        log.inward_vehicle_back_side_photo,
        'Vehicle Back',
        'inward_vehicle_back_side_photo',
        metaByField
      ),
      ...expandMultiPhotos(
        log.inward_vehicle_back_side_photo_with_material,
        'Vehicle Loaded',
        'inward_vehicle_back_side_photo_with_material',
        metaByField
      ),
      ...expandMultiPhotos(log.inward_count_sheet_photo, 'Count Sheet', 'inward_count_sheet_photo', metaByField),
      ...expandMultiPhotos(log.inward_damage_boxes_photo, 'Damage Box', 'inward_damage_boxes_photo', metaByField)
    ];
  }
  return [
    ...expandMultiPhotos(log.outward_invoice_photos, 'Invoice Photo', 'outward_invoice_photos', metaByField),
    ...expandMultiPhotos(log.outward_pod_photo, 'POD Photo', 'outward_pod_photo', metaByField),
    ...expandMultiPhotos(log.outward_vehicle_seal_photo, 'Vehicle Seal', 'outward_vehicle_seal_photo', metaByField),
    ...expandMultiPhotos(
      log.outward_pre_vehicle_temp_photo,
      'Pre-Cooling Temp',
      'outward_pre_vehicle_temp_photo',
      metaByField
    ),
    ...expandMultiPhotos(log.outward_vehicle_temp_photo, 'Vehicle Temp', 'outward_vehicle_temp_photo', metaByField),
    ...expandMultiPhotos(log.outward_material_temp_photo, 'Material Temp', 'outward_material_temp_photo', metaByField),
    ...expandMultiPhotos(
      log.outward_vehicle_back_side_photo,
      'Vehicle Back',
      'outward_vehicle_back_side_photo',
      metaByField
    ),
    ...expandMultiPhotos(
      log.outward_vehicle_back_side_photo_with_material,
      'Vehicle Loaded',
      'outward_vehicle_back_side_photo_with_material',
      metaByField
    ),
    ...expandMultiPhotos(log.outward_count_sheet_photo, 'Count Sheet', 'outward_count_sheet_photo', metaByField),
    ...expandMultiPhotos(log.outward_damage_boxes_photo, 'Damage Box', 'outward_damage_boxes_photo', metaByField)
  ];
}

function resolveType(log, detailType) {
  const t = String(detailType || '').toLowerCase();
  if (t === 'daily' || t === 'inward' || t === 'outward') return t;
  if (log?.inward_id || log?.inward_vehicle_no || log?.inward_client_name) return 'inward';
  if (log?.outward_id || log?.outward_vehicle_no || log?.outward_client_name) return 'outward';
  return 'daily';
}

function typeMeta(type) {
  if (type === 'inward') {
    return { label: 'Inward Receiving', Icon: ArrowDownLeft, tone: 'in' };
  }
  if (type === 'outward') {
    return { label: 'Outward Dispatch', Icon: ArrowUpRight, tone: 'out' };
  }
  return { label: 'Temperature Check', Icon: Thermometer, tone: 'temp' };
}

function DetailField({ icon: Icon, label, value, alert, ok, span2, children }) {
  return (
    <div className={`td-detail${span2 ? ' span2' : ''}`}>
      <span className="td-detail-icon" aria-hidden="true">
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <div>
        <em>{label}</em>
        {children || (
          <strong className={alert ? 'alert' : ok ? 'ok' : undefined}>{value}</strong>
        )}
      </div>
    </div>
  );
}

export default function TaskDetailsView({
  log,
  detailType: detailTypeProp,
  onClose,
  onEdit,
  onDelete,
  onZoom,
  renderOperatorEmail
}) {
  const [copied, setCopied] = useState(false);
  const type = resolveType(log, detailTypeProp);

  const photos = useMemo(() => (log ? collectPhotos(log, type) : []), [log, type]);

  if (!log) return null;

  const typeInfo = typeMeta(type);
  const TypeIcon = typeInfo.Icon;
  const refNo =
    log.reference_no ||
    `ID: ${log.id || log.inward_id || log.outward_id || '—'}`;

  const createdAt = log.created_at || log.inward_created_at || log.outward_created_at;
  const updatedAt = log.updated_at || log.inward_updated_at || log.outward_updated_at;
  const submittedAt = log.photo_capture_time || createdAt;
  const completedAt = updatedAt || createdAt;
  const hasUpdates = Number(log.update_count) > 0 || !!log.update_details;
  const status = statusFromLog(log);

  const operatorLabel =
    typeof renderOperatorEmail === 'function'
      ? renderOperatorEmail(log.operator_email)
      : log.operator_email || 'Operator';

  const tempVal = log.chamber_temp ?? log.box_temp;
  const chamberType =
    pickComplianceZone(log.chamber_type) || String(log.chamber_type || '').trim() || 'Frozen';
  const tempDeviation = getChamberTempDeviation(tempVal, chamberType);
  const tempOutOfRange = tempDeviation != null;
  const tempRange = getChamberTempRange(chamberType);
  const shiftLabel = resolveShift(log.shift, log.inspection_time, createdAt);
  const dailyDate = fmtDate(log.formatted_date || log.entry_date);
  const boxCount =
    log.box_count !== undefined && log.box_count !== null ? String(log.box_count) : '—';

  const ioClient =
    type === 'inward' ? log.inward_client_name : type === 'outward' ? log.outward_client_name : log.client_name;
  const ioDate =
    type === 'inward'
      ? fmtDate(log.inward_entry_date)
      : type === 'outward'
        ? fmtDate(log.outward_entry_date)
        : dailyDate;
  const ioVehicle = type === 'inward' ? log.inward_vehicle_no : log.outward_vehicle_no;
  const ioTemp =
    type === 'inward'
      ? log.inward_material_temp
      : type === 'outward'
        ? log.outward_vehicle_temp ?? log.outward_material_temp
        : tempVal;
  const ioBoxes =
    type === 'inward'
      ? fmtQty(log.inward_received_boxes_qty ?? log.inward_received_qty)
      : type === 'outward'
        ? fmtQty(log.outward_received_boxes_qty ?? log.outward_received_qty)
        : boxCount;
  const ioDuration =
    type === 'inward'
      ? fmtDuration(log.inward_unloading_duration_hours, log.inward_unloading_duration_mins)
      : type === 'outward'
        ? fmtDuration(log.outward_loading_duration_hours, log.outward_loading_duration_mins)
        : null;

  const copyRef = () => {
    if (!log.reference_no) return;
    navigator.clipboard.writeText(log.reference_no).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const toSubmit = formatSpanDuration(createdAt, submittedAt);
  const toComplete = formatSpanDuration(submittedAt, completedAt);
  const totalDur = formatSpanDuration(createdAt, completedAt);
  const varianceMins = type === 'daily' ? resolveTimeVarianceMinutes(log) : null;
  const variance = formatVarianceMins(varianceMins);

  const metricClient = type === 'daily' ? log.client_name : ioClient;
  const metricSecondLabel = type === 'daily' ? 'Chamber' : 'Vehicle';
  const metricSecondValue = type === 'daily' ? log.chamber_name : ioVehicle;
  const metricTempLabel = type === 'daily' ? 'Temperature' : type === 'inward' ? 'Material Temp' : 'Loading Temp';
  const metricTempValue = ioTemp != null && ioTemp !== '' ? `${ioTemp}°C` : '—';
  const metricBoxesLabel = type === 'daily' ? 'Boxes' : type === 'inward' ? 'Received Boxes' : 'Loaded Boxes';

  return (
    <div className="td-card" onClick={(e) => e.stopPropagation()}>
      <header className="td-header">
        <div className="td-header-left">
          <span className={`td-header-icon ${typeInfo.tone}`} aria-hidden="true">
            <ClipboardCheck size={20} strokeWidth={2.2} />
          </span>
          <div className="td-header-text">
            <p className="td-eyebrow">Task Details</p>
            <h2 className="td-ref">{refNo}</h2>
          </div>
        </div>
        <div className="td-header-center">
          <span className={`td-type-badge ${typeInfo.tone}`} title="Task type">
            <TypeIcon size={12} />
            {typeInfo.label}
          </span>
        </div>
        <div className="td-header-right">
          <span className={`td-status ${status.tone}`}>
            {status.tone === 'ok' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            {status.label}
          </span>
          {typeof onEdit === 'function' ? (
            <button type="button" className="td-btn edit" onClick={onEdit}>
              <Edit size={14} />
              Edit
            </button>
          ) : null}
          {typeof onDelete === 'function' ? (
            <button type="button" className="td-btn delete" onClick={onDelete}>
              <Trash2 size={14} />
              Delete
            </button>
          ) : null}
          <button type="button" className="td-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="td-scroll">
        <div className="td-metrics">
          <div className="td-metric">
            <span className="td-metric-icon">
              <User size={14} />
            </span>
            <div>
              <em>Client Name</em>
              <strong title={metricClient || ''}>{metricClient || '—'}</strong>
            </div>
          </div>
          <div className="td-metric">
            <span className="td-metric-icon">
              {type === 'daily' ? <LayoutGrid size={14} /> : <Truck size={14} />}
            </span>
            <div>
              <em>{metricSecondLabel}</em>
              <strong>{metricSecondValue || '—'}</strong>
            </div>
          </div>
          <div className="td-metric">
            <span className="td-metric-icon">
              <Calendar size={14} />
            </span>
            <div>
              <em>Date</em>
              <strong>{type === 'daily' ? dailyDate : ioDate}</strong>
            </div>
          </div>
          <div className="td-metric">
            <span className="td-metric-icon">
              <Thermometer size={14} />
            </span>
            <div>
              <em>{metricTempLabel}</em>
              <strong
                style={{
                  color:
                    type === 'daily' && tempOutOfRange
                      ? '#b91c1c'
                      : undefined
                }}
              >
                {metricTempValue}
              </strong>
              {type === 'daily' ? (
                <span className={`td-pill${tempOutOfRange ? ' warn' : ''}`}>{chamberType}</span>
              ) : null}
            </div>
          </div>
          <div className="td-metric">
            <span className="td-metric-icon">
              <Package size={14} />
            </span>
            <div>
              <em>{metricBoxesLabel}</em>
              <strong>{type === 'daily' ? boxCount : ioBoxes}</strong>
            </div>
          </div>
        </div>

        <div className="td-layout">
          <div className="td-col">
            <section className="td-panel">
              <div className="td-panel-head">
                <h4>
                  <FileText size={15} />
                  Quick Summary
                </h4>
              </div>
              {type === 'daily' ? (
                <div className="td-grid">
                  <div className="td-field">
                    <em>Client Name</em>
                    <strong>{log.client_name || '—'}</strong>
                  </div>
                  <div className="td-field">
                    <em>Chamber</em>
                    <strong>{log.chamber_name || '—'}</strong>
                  </div>
                  <div className="td-field">
                    <em>Date</em>
                    <strong>{dailyDate}</strong>
                  </div>
                  <div className="td-field">
                    <em>Time / Shift</em>
                    <strong>
                      {log.inspection_time || '—'} · {shiftLabel}
                    </strong>
                  </div>
                  <div className="td-field">
                    <em>Temperature</em>
                    <strong style={{ color: tempOutOfRange ? '#b91c1c' : '#15803d' }}>
                      {tempVal != null ? `${tempVal}°C` : '—'}{' '}
                      <span className={`td-pill${tempOutOfRange ? ' warn' : ' ok'}`}>
                        {chamberType}
                      </span>
                    </strong>
                  </div>
                  <div className="td-field">
                    <em>Boxes</em>
                    <strong>{boxCount}</strong>
                  </div>
                </div>
              ) : (
                <div className="td-grid">
                  <div className="td-field">
                    <em>Client Name</em>
                    <strong>{ioClient || '—'}</strong>
                  </div>
                  <div className="td-field">
                    <em>Vehicle</em>
                    <strong>{ioVehicle || '—'}</strong>
                  </div>
                  <div className="td-field">
                    <em>Date</em>
                    <strong>{ioDate}</strong>
                  </div>
                  <div className="td-field">
                    <em>{type === 'inward' ? 'Dock / Seal' : 'Dock / Seal'}</em>
                    <strong>
                      {type === 'inward'
                        ? `${log.inward_dock_no || '—'} / ${log.inward_seal_no || '—'}`
                        : `${log.outward_dock_no || '—'} / ${log.outward_seal_no || '—'}`}
                    </strong>
                  </div>
                  <div className="td-field">
                    <em>{metricTempLabel}</em>
                    <strong>{metricTempValue}</strong>
                  </div>
                  <div className="td-field">
                    <em>{metricBoxesLabel}</em>
                    <strong>{ioBoxes}</strong>
                  </div>
                </div>
              )}
              {hasUpdates ? (
                <div className="td-note warn">
                  Updated {Number(log.update_count) > 0 ? log.update_count : 1}{' '}
                  {Number(log.update_count) === 1 ? 'time' : 'times'}
                  {updatedAt ? ` · Last: ${fmtDateTime(updatedAt)}` : ''}.
                </div>
              ) : (
                <div className="td-note">No updates yet — original submitted values below.</div>
              )}
            </section>

            <section className="td-panel">
              <div className="td-panel-head">
                <h4>
                  <FileText size={15} />
                  Full Log Details
                </h4>
              </div>
              <div className="td-detail-grid">
                {type === 'daily' ? (
                  <>
                    <DetailField icon={Calendar} label="Entry Date" value={dailyDate} />
                    <DetailField icon={ClipboardCheck} label="Reference No">
                      <strong>
                        {log.reference_no ? (
                          <span className="td-copy" onClick={copyRef} title="Copy reference">
                            {log.reference_no}
                            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          </span>
                        ) : (
                          '—'
                        )}
                      </strong>
                    </DetailField>
                    <DetailField icon={User} label="Client Name" value={log.client_name || '—'} />
                    <DetailField icon={LayoutGrid} label="Chamber Name" value={log.chamber_name || '—'} />
                    <DetailField
                      icon={Building2}
                      label="Chamber Type"
                      value={chamberType}
                      alert={tempOutOfRange}
                    />
                    <DetailField icon={Clock} label="Inspection Time" value={log.inspection_time || '—'} />
                    <DetailField icon={Sun} label="Shift" value={shiftLabel} />
                    <DetailField
                      icon={Thermometer}
                      label="Box Temp (°C)"
                      value={tempVal != null ? `${tempVal}°C` : '—'}
                      alert={tempOutOfRange}
                      ok={!tempOutOfRange && tempVal != null}
                    />
                    {tempOutOfRange && tempRange ? (
                      <DetailField
                        icon={Thermometer}
                        label="Compliance"
                        value={`${tempDeviation === 'low' ? 'Below' : 'Above'} · allowed ${tempRange.label}`}
                        alert
                        span2
                      />
                    ) : null}
                    <DetailField icon={Package} label="Box Count" value={boxCount} />
                    <DetailField
                      icon={User}
                      label="Supervisor"
                      value={log.monitor_supervisor_name || '—'}
                    />
                    <DetailField icon={Building2} label="Warehouse" value={log.warehouse_name || '—'} />
                    <DetailField icon={User} label="Operator" value={operatorLabel || '—'} />
                    <DetailField icon={Clock} label="Created At" value={fmtDateTime(createdAt)} />
                    <DetailField
                      icon={Clock}
                      label="Updated At"
                      value={
                        updatedAt && updatedAt !== createdAt ? fmtDateTime(updatedAt) : '—'
                      }
                    />
                    <DetailField icon={FileText} label="Remarks" value={log.remarks || '—'} span2 />
                  </>
                ) : type === 'inward' ? (
                  <>
                    <DetailField icon={Calendar} label="Entry Date" value={ioDate} />
                    <DetailField icon={ClipboardCheck} label="Reference No">
                      <strong>
                        {log.reference_no ? (
                          <span className="td-copy" onClick={copyRef} title="Copy reference">
                            {log.reference_no}
                            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          </span>
                        ) : (
                          '—'
                        )}
                      </strong>
                    </DetailField>
                    <DetailField icon={User} label="Client Name" value={ioClient || '—'} />
                    <DetailField icon={Truck} label="Vehicle Number" value={ioVehicle || '—'} />
                    <DetailField icon={Hash} label="Dock Number" value={log.inward_dock_no || '—'} />
                    <DetailField icon={Hash} label="Seal Number" value={log.inward_seal_no || '—'} />
                    <DetailField icon={FileText} label="Invoice No." value={log.inward_invoice_no || '—'} />
                    <DetailField icon={User} label="Mens Power" value={fmtQty(log.inward_mens_power)} />
                    <DetailField
                      icon={Thermometer}
                      label="Vehicle Temp"
                      value={
                        log.inward_vehicle_temp != null ? `${log.inward_vehicle_temp}°C` : '—'
                      }
                    />
                    <DetailField
                      icon={Thermometer}
                      label="Material Temp"
                      value={
                        log.inward_material_temp != null ? `${log.inward_material_temp}°C` : '—'
                      }
                    />
                    <DetailField
                      icon={Package}
                      label="Pallets In"
                      value={fmtQty(log.inward_pallets_in_qty)}
                    />
                    <DetailField
                      icon={Package}
                      label="Material Type"
                      value={log.inward_material_type || '—'}
                    />
                    <DetailField
                      icon={Package}
                      label="Invoice / Received Qty"
                      value={`${fmtQty(log.inward_invoice_qty)} / ${fmtQty(log.inward_received_qty)}`}
                    />
                    <DetailField
                      icon={Package}
                      label="Received Boxes"
                      value={fmtQty(log.inward_received_boxes_qty)}
                    />
                    <DetailField
                      icon={Package}
                      label="Damage Boxes"
                      value={fmtQty(log.inward_damage_received_boxes_qty)}
                    />
                    <DetailField
                      icon={User}
                      label="Unloading Supervisor"
                      value={log.inward_unloading_supervisor_name || '—'}
                    />
                    <DetailField
                      icon={Truck}
                      label="Transporter"
                      value={log.inward_transporter_name || '—'}
                    />
                    <DetailField icon={User} label="Driver Name" value={log.inward_driver_name || '—'} />
                    <DetailField icon={Phone} label="Driver Phone" value={log.inward_driver_no || '—'} />
                    <DetailField
                      icon={Clock}
                      label="Reporting Time"
                      value={log.inward_vehicle_reporting_time || '—'}
                    />
                    <DetailField
                      icon={Clock}
                      label="Unloading Duration"
                      value={ioDuration}
                    />
                    <DetailField
                      icon={Clock}
                      label="Unload Start / End"
                      value={`${log.inward_unloading_start_time || '—'} → ${log.inward_unloading_end_time || '—'}`}
                      span2
                    />
                    <DetailField icon={Building2} label="Warehouse" value={log.warehouse_name || '—'} />
                    <DetailField icon={User} label="Operator" value={operatorLabel || '—'} />
                    <DetailField icon={Clock} label="Created At" value={fmtDateTime(createdAt)} />
                    <DetailField
                      icon={Clock}
                      label="Updated At"
                      value={
                        updatedAt && updatedAt !== createdAt ? fmtDateTime(updatedAt) : '—'
                      }
                    />
                    <DetailField
                      icon={FileText}
                      label="Remarks"
                      value={log.inward_remarks || log.remarks || '—'}
                      span2
                    />
                  </>
                ) : (
                  <>
                    <DetailField icon={Calendar} label="Entry Date" value={ioDate} />
                    <DetailField icon={ClipboardCheck} label="Reference No">
                      <strong>
                        {log.reference_no ? (
                          <span className="td-copy" onClick={copyRef} title="Copy reference">
                            {log.reference_no}
                            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          </span>
                        ) : (
                          '—'
                        )}
                      </strong>
                    </DetailField>
                    <DetailField icon={User} label="Client Name" value={ioClient || '—'} />
                    <DetailField icon={Truck} label="Vehicle Number" value={ioVehicle || '—'} />
                    <DetailField icon={Hash} label="Dock Number" value={log.outward_dock_no || '—'} />
                    <DetailField icon={Hash} label="Seal Number" value={log.outward_seal_no || '—'} />
                    <DetailField icon={FileText} label="Invoice No." value={log.outward_invoice_no || '—'} />
                    <DetailField icon={User} label="Mens Power" value={fmtQty(log.outward_mens_power)} />
                    <DetailField
                      icon={Thermometer}
                      label="Pre-Cooling Temp"
                      value={
                        log.outward_pre_vehicle_temp != null
                          ? `${log.outward_pre_vehicle_temp}°C`
                          : '—'
                      }
                    />
                    <DetailField
                      icon={Thermometer}
                      label="Loading Temp"
                      value={
                        log.outward_vehicle_temp != null ? `${log.outward_vehicle_temp}°C` : '—'
                      }
                    />
                    <DetailField
                      icon={Thermometer}
                      label="Material Temp"
                      value={
                        log.outward_material_temp != null ? `${log.outward_material_temp}°C` : '—'
                      }
                    />
                    <DetailField
                      icon={Package}
                      label="Pallets Out"
                      value={fmtQty(log.outward_pallets_in_qty)}
                    />
                    <DetailField
                      icon={Package}
                      label="Material Type"
                      value={log.outward_material_type || '—'}
                    />
                    <DetailField
                      icon={Package}
                      label="Invoice / Loaded Qty"
                      value={`${fmtQty(log.outward_invoice_qty)} / ${fmtQty(log.outward_received_qty)}`}
                    />
                    <DetailField
                      icon={Package}
                      label="Loaded Boxes"
                      value={fmtQty(log.outward_received_boxes_qty)}
                    />
                    <DetailField
                      icon={Package}
                      label="Damage Boxes"
                      value={fmtQty(log.outward_damage_received_boxes_qty)}
                    />
                    <DetailField
                      icon={User}
                      label="Loading Supervisor"
                      value={log.outward_loading_supervisor_name || '—'}
                    />
                    <DetailField
                      icon={Truck}
                      label="Transporter"
                      value={log.outward_transporter_name || '—'}
                    />
                    <DetailField icon={User} label="Driver Name" value={log.outward_driver_name || '—'} />
                    <DetailField icon={Phone} label="Driver Phone" value={log.outward_driver_no || '—'} />
                    <DetailField icon={Clock} label="Loading Duration" value={ioDuration} />
                    <DetailField
                      icon={Clock}
                      label="Load Start / End"
                      value={`${log.outward_loading_start_time || '—'} → ${log.outward_loading_end_time || '—'}`}
                      span2
                    />
                    <DetailField icon={Building2} label="Warehouse" value={log.warehouse_name || '—'} />
                    <DetailField icon={User} label="Operator" value={operatorLabel || '—'} />
                    <DetailField icon={Clock} label="Created At" value={fmtDateTime(createdAt)} />
                    <DetailField
                      icon={Clock}
                      label="Updated At"
                      value={
                        updatedAt && updatedAt !== createdAt ? fmtDateTime(updatedAt) : '—'
                      }
                    />
                    <DetailField
                      icon={FileText}
                      label="Remarks"
                      value={log.outward_remarks || log.remarks || '—'}
                      span2
                    />
                  </>
                )}
              </div>
            </section>
          </div>

          <aside className="td-side">
            <section className="td-panel">
              <div className="td-panel-head">
                <h4>
                  <Camera size={15} />
                  Uploaded Audit Attachment Photos
                </h4>
                {photos.length > 0 ? (
                  <button
                    type="button"
                    className="td-link"
                    onClick={() => onZoom?.(resolveMediaSrc(photos[0].src))}
                  >
                    View All ({photos.length})
                  </button>
                ) : null}
              </div>
              {photos.length > 0 ? (
                <div className={`td-photos${photos.length === 1 ? ' single' : ''}`}>
                  {photos.map((p, idx) => (
                    <div key={`${p.label}-${idx}`} className="td-photo-wrap">
                      <button
                        type="button"
                        className="td-photo"
                        onClick={() => onZoom?.(resolveMediaSrc(p.src))}
                      >
                        <div className="td-photo-media">
                          <img src={resolveMediaSrc(p.src)} alt={p.label} loading="lazy" />
                          <span className="td-photo-expand" aria-hidden="true">
                            <Maximize2 size={12} />
                          </span>
                        </div>
                        <div className="td-photo-meta">
                          <strong>{p.label}</strong>
                          <span>{p.meta}</span>
                          {p.capturedAt ? (
                            <span className="td-photo-time">{fmtDateTime(p.capturedAt)}</span>
                          ) : null}
                        </div>
                      </button>
                      {p.lat != null && p.lng != null ? (
                        <div className="td-photo-geo">
                          <MapPin size={12} />
                          <div className="td-photo-geo-text">
                            <em>Geo location</em>
                            <PhotoGpsLink lat={p.lat} lng={p.lng} accuracy={p.accuracy} />
                          </div>
                          <a
                            className="td-geo-link"
                            href={`https://www.google.com/maps?q=${Number(p.lat)},${Number(p.lng)}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open in Maps"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MapPin size={13} />
                          </a>
                        </div>
                      ) : (
                        <div className="td-photo-geo muted">
                          <MapPin size={12} />
                          <span>Location not captured</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="td-empty-photos">No audit photos uploaded for this task.</div>
              )}
            </section>

            <section className="td-panel">
              <div className="td-panel-head">
                <h4>
                  <Settings2 size={15} />
                  Task Timeline
                </h4>
                {totalDur ? <span className="td-tl-total">Total · {totalDur}</span> : null}
              </div>
              <ul className="td-timeline">
                <li>
                  <span className="td-tl-dot done" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <strong>Task Created</strong>
                  <span>{fmtDateTime(createdAt)} · By System</span>
                </li>
                <li>
                  <span className="td-tl-dot done" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <div className="td-tl-row">
                    <strong>Data Submitted</strong>
                    {toSubmit ? <em className="td-tl-dur">+{toSubmit}</em> : null}
                  </div>
                  <span>{fmtDateTime(submittedAt)} · By Operator</span>
                </li>
                <li>
                  <span
                    className={`td-tl-dot${status.tone === 'ok' ? ' active' : ' pending'}`}
                    aria-hidden="true"
                  >
                    {status.tone === 'ok' ? (
                      <span className="td-tl-dot-core" />
                    ) : (
                      <Circle size={10} strokeWidth={2.5} />
                    )}
                  </span>
                  <div className="td-tl-row">
                    <strong>Task Completed</strong>
                    {toComplete ? <em className="td-tl-dur">+{toComplete}</em> : null}
                  </div>
                  <span>{fmtDateTime(completedAt)} · By Operator</span>
                </li>
              </ul>
              {type === 'daily' && variance != null ? (
                <div
                  className={`td-tl-variance${
                    varianceMins > 120 ? ' hot' : varianceMins === 0 ? ' ok' : ''
                  }`}
                >
                  <Clock size={13} />
                  <span>
                    Time variance · {variance}
                    {log.inspection_time ? (
                      <em className="td-tl-var-sub"> (vs inspection {log.inspection_time})</em>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {type !== 'daily' && ioDuration && ioDuration !== '—' ? (
                <div className="td-tl-variance ok">
                  <Clock size={13} />
                  <span>
                    {type === 'inward' ? 'Unloading' : 'Loading'} duration · {ioDuration}
                  </span>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
