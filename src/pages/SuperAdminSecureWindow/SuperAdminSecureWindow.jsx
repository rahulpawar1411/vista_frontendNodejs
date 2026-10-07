// ====================================================================
// Super Admin Secure Window (SuperAdminSecureWindow.jsx + .css)
// --------------------------------------------------------------------
// OVERVIEW (beginner):
//   WHAT: Full web console for Super Admin — dashboard, DOs, customers, logs, exports.
//   WHY:  One place to approve edits, manage master data, and audit cold-chain records.
//   HOW:  Sidebar sets activeMenu; each menu loads data via services/api.js; large tables paginate.
//
// Major menus (activeMenu): dashboard | data_operators | customers | master_data |
//   customer_reports | activity_logs | history_logs | profile_lookup | inventory_log |
//   daily_box_tracker | super_admin_profile
//
// Role: super_admin only (App.jsx routes here after login).
// ====================================================================

import React, { useState, useEffect, useMemo, Suspense, lazy, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldCheck, Clock, LogOut, Database, Lock, Calendar,
  Thermometer, Trash2, Edit, UserPlus, ShieldAlert,
  Menu, X, ChevronRight, User, Eye, EyeOff, Activity, Search, Download, History, LayoutDashboard,
  Copy, Check, Loader2, CheckCircle, ClipboardCheck, MessageSquareWarning, MessageSquare, Smartphone, Package, Users, LayoutGrid,
  ChevronDown, ChevronUp, Plus, ArrowLeft, Undo2, Mail, Home, RefreshCw, FileText, MoreVertical,
  Phone, ArrowDownLeft, ArrowUpRight, CheckCircle2, Sun, Moon, MapPin, UserX, Info
} from 'lucide-react';
import Logo from '../../components/Logo/Logo';
import PaginationBar from '../../components/PaginationBar/PaginationBar';
import { 
  fetchOperators, createOperator, updateOperator, deleteOperator, fetchOperatorActivities,
  fetchAllOperatorActivities,
  fetchPermissionRequests, updatePermissionRequest, fetchSystemConfig, updateSystemConfig,
  fetchRecordPermissionHistory,
  fetchChamberLogs, fetchInwardLogs, fetchOutwardLogs, fetchDashboardStats, fetchDoTaskOverview,
  fetchDoOperatorIoCounts,
  fetchAllChamberLogs, fetchAllInwardLogs, fetchAllOutwardLogs, fetchAllLogPages,
  deleteChamberLog, deleteInwardLog, deleteOutwardLog,
  toApiDateParam,
  fetchSubAdmins, createSubAdmin, updateSubAdmin, deleteSubAdmin, fetchAccessScopeOptions,
  changeSuperAdminPassword, verifySuperAdminProfileAccess,
  fetchCustomerReports, updateCustomerReportStatus, deleteCustomerReport,
  fetchCustomerNoteThreads, fetchCustomerNotes, postCustomerNote, deleteCustomerNote,
  fetchDailyInspections, deleteDailyInspection,
  fetchInventoryReconciliation, fetchInventoryFilterOptions,
  fetchClientMonthBoxSheet,
  fetchAppSubAdmins, createAppSubAdmin, deleteAppSubAdmin,
  fetchChamberAssignments, addChamberAssignment, deleteChamberAssignment,
  fetchChambers, createChamber, updateChamber, deleteChamber,
  fetchMasterWarehouses, fetchMasterClients
} from '../../services/api';
import MasterDataPanel from '../../components/MasterDataPanel/MasterDataPanel';
import {
  pickComplianceZone,
  getChamberTempRange,
  getChamberTempDeviation,
  formatTempDisplay
} from '../../utils/chamberTempCompliance';
import { formatMasterLabel, lookupMasterLabel } from '../../utils/masterLabels';
import {
  requireExportDates,
  confirmExportSize,
  downloadCsv,
  toCsvContent,
  excelRatioText,
  formatExportProgress,
  getExportErrorMessage,
  isRetryableExportError
} from '../../utils/exportCsv';
import {
  formatPhotoCaptureMetadataForExport,
  formatPhotoGpsForExport,
} from '../../utils/photoCaptureExport';
import ExportErrorBanner from '../../components/ExportErrorBanner/ExportErrorBanner';
import PhotoGpsLink from '../../components/PhotoGpsLink/PhotoGpsLink';
import PhotoCaptureMetaPanel from '../../components/PhotoCaptureMetaPanel/PhotoCaptureMetaPanel';
import { resolveMediaSrc as toMediaSrc } from '../../utils/resolveMediaSrc';
import LoadErrorBanner from '../../components/LoadErrorBanner/LoadErrorBanner';
import { USE_NEW_SA_DASHBOARD } from './dashboard/saDashboardUi';
import SaDashboardControlCenter from './dashboard/SaDashboardControlCenter';
import TaskDetailsView from '../../components/TaskDetailsView/TaskDetailsView';
import {
  computeDoTaskStatus,
  getActiveOperatorAssignments,
  getDefaultOpTaskRange,
  getOperatorDisplayChambers,
  assignmentMatchesDisplayChamber,
  chamberNumberFromName as strictChamberNumberFromName,
  localDateStr,
  enumerateDateKeys
} from '../../utils/doTaskStatus';
import '../../components/DOSidebar/DOSidebar.css';
import './SuperAdminSecureWindow.css';
import './SaRegisterOperator.css';
import './DoProfileControlCenter.css';

const TempMonitor = lazy(() => import('../TempMonitor/TempMonitor'));
const InwardMonitor = lazy(() => import('../InwardMonitor/InwardMonitor'));
const OutwardMonitor = lazy(() => import('../OutwardMonitor/OutwardMonitor'));

/** Highlight Added / Deleted keywords in DO operation log descriptions. */
const highlightAddedDeletedWords = (text, extraNodes = null) => {
  const str = String(text || '');
  if (!str) return extraNodes || '';
  const parts = str.split(/(\bAdded\b|\bDeleted\b|\badded\b|\bdeleted\b)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (/^(Added|Deleted|added|deleted)$/.test(part)) {
          return (
            <span key={`kw-${i}`} style={{ color: '#dc2626', fontWeight: 800 }}>
              {part}
            </span>
          );
        }
        return <React.Fragment key={`t-${i}`}>{part}</React.Fragment>;
      })}
      {extraNodes}
    </span>
  );
};

const chamberNumberFromName = strictChamberNumberFromName;

/** WHAT: True when chamber–client assignment row is marked inactive. WHY/HOW: Filters mapping lists and dedupe logic. */
const isDeactiveAssignment = (row) =>
  String(row?.status || 'active').trim().toLowerCase() === 'inactive';

/** WHAT: Stable string key for chamber + client pair. WHY/HOW: Deduplicates assignment rows in UI. */
const assignmentClientKey = (row) =>
  `${row?.chamber_id ?? ''}|${String(row?.client_name || '').trim().toLowerCase()}`;

const uniqueClientsByName = (list) => {
  const seen = new Set();
  const out = [];
  (list || []).forEach((row) => {
    const key = String(row?.client_name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
};

const resolveChamberIdFromList = (rows, chamberId, chamberName) => {
  const list = Array.isArray(rows) ? rows : [];
  const wantName = String(chamberName || '').trim().toLowerCase();
  if (wantName) {
    const byName = list.find((c) => String(c.name || c.chamber_name || '').trim().toLowerCase() === wantName);
    if (byName?.id) return byName.id;
  }
  const wantNum = chamberNumberFromName(chamberName) || Number(chamberId);
  if (Number.isFinite(wantNum)) {
    const byNum = list.find((c) => chamberNumberFromName(c.name || c.chamber_name) === wantNum);
    if (byNum?.id) return byNum.id;
  }
  const byId = list.find((c) => Number(c.id) === Number(chamberId));
  if (byId?.id) return byId.id;
  return chamberId;
};

const toLocalTenDigitPhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
};

const toStoredIndiaPhone = (value) => {
  const local = toLocalTenDigitPhone(value);
  return local.length === 10 ? `+91${local}` : local;
};

const formatIndiaPhoneDisplay = (value) => {
  const local = toLocalTenDigitPhone(value);
  if (!local) return '—';
  return local.length === 10 ? `+91 ${local}` : local;
};

/** One row per chamber + client. Active wins over deactive; later row fills gaps. */
const dedupeChamberAssignments = (rows) => {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row) return;
    const key = assignmentClientKey(row);
    if (key.endsWith('|')) return;
    const nextInactive = isDeactiveAssignment(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      return;
    }
    const prevInactive = isDeactiveAssignment(prev);
    if (prevInactive && !nextInactive) {
      map.set(key, row);
      return;
    }
    if (!prevInactive && nextInactive) return;
    const prevWh = String(prev.warehouse_name || '').trim();
    const nextWh = String(row.warehouse_name || '').trim();
    if (!prevWh && nextWh) map.set(key, row);
  });
  return Array.from(map.values());
};

/** Stable key so the same pending request never appears twice in SA UI. */
const buildPendingPermissionFingerprint = (pr) => {
  const desc = String(pr?.request_description || pr?.description || '');
  const op = String(pr?.operator_email || '').toLowerCase();
  const type = pr?.record_type || '';
  const actionKind = pr?.raw_action === 'REQUEST_DELETE' ? 'delete' : 'edit';

  if (type === 'ClientMaster') {
    const addMatch = desc.match(/ADD client "([^"]+)"/i);
    const delMatch = desc.match(/DELETE client "([^"]+)"/i);
    const editMatch = desc.match(/EDIT client "([^"]+)"/i);
    const renameTo = desc.match(/EDIT client "[^"]+"\s*(?:→|->)\s*"([^"]+)"/i);
    const chamberMatch =
      desc.match(/\(id:\s*(\d+)\)/i) ||
      desc.match(/chamber_id:\s*(\d+)/i);
    const client = String(addMatch?.[1] || delMatch?.[1] || editMatch?.[1] || '')
      .trim()
      .toLowerCase();
    const chamberId = chamberMatch?.[1] || pr?.chamber_id || '';
    const kind = addMatch ? 'add' : delMatch ? 'delete' : editMatch ? 'edit' : actionKind;
    const renameKey = renameTo ? `->${String(renameTo[1]).trim().toLowerCase()}` : '';
    return `${op}|ClientMaster|${kind}|${chamberId}|${client}${renameKey}`;
  }

  if (type === 'ChamberType') {
    const chamberMatch = desc.match(/\(id:\s*(\d+)\)/i);
    return `${op}|ChamberType|${chamberMatch?.[1] || pr?.record_id || ''}`;
  }

  if (type === 'ChamberMaster') {
    const addMatch = desc.match(/ADD chamber "([^"]+)"/i);
    const delMatch = desc.match(/delete chamber "([^"]+)"/i);
    const name = String(addMatch?.[1] || delMatch?.[1] || '').trim().toLowerCase();
    const kind = addMatch ? 'add' : delMatch ? 'delete' : actionKind;
    return `${op}|ChamberMaster|${kind}|${name || pr?.record_id}`;
  }

  return `${op}|${type}|${pr?.record_id}|${actionKind}`;
};

/** Pending DO permission rows Super Admin can approve/deny (excludes notify-only types). */
const filterActionablePendingPermissionRequests = (
  requests,
  warehouseMap = {},
  warehouseFilter = 'All'
) => {
  const pending = (requests || []).filter((pr) => pr?.status === 'Pending');
  const filtered = pending.filter((pr) => {
    if (pr.record_type === 'MasterSetup') return false;
    if (pr.record_type === 'DO_CHANGE' || pr.record_type === 'activity') return false;
    if (warehouseFilter === 'All') return true;
    const operatorEmail = pr.operator_email ? pr.operator_email.toLowerCase() : '';
    const wh = warehouseMap[operatorEmail];
    if (warehouseFilter === 'System/Admin') return !wh || operatorEmail === 'system';
    return wh === warehouseFilter;
  });

  const byFingerprint = new Map();
  for (const pr of filtered) {
    const fp = buildPendingPermissionFingerprint(pr);
    const cur = byFingerprint.get(fp);
    if (!cur || Number(pr.id) > Number(cur.id)) {
      byFingerprint.set(fp, pr);
    }
  }
  return Array.from(byFingerprint.values()).sort((a, b) => Number(b.id) - Number(a.id));
};

/** Circle spinner used while Super Admin section data is loading. */
const SaDataLoading = ({ label = 'Loading data…', compact = false }) => (
  <div className={`sa-data-loading${compact ? ' is-compact' : ''}`} role="status" aria-live="polite">
    <Loader2 size={compact ? 22 : 32} className="spinner-icon" color="#0033a0" aria-hidden />
    <span>{label}</span>
  </div>
);

/** Recent Approved/Denied rows for Super Admin audit (who decided). */
const filterDecidedPermissionRequests = (
  requests,
  warehouseMap = {},
  warehouseFilter = 'All',
  limit = 40
) => {
  const decided = (requests || []).filter(
    (pr) => pr?.status === 'Approved' || pr?.status === 'Denied'
  );
  const filtered = decided.filter((pr) => {
    if (pr.record_type === 'MasterSetup') return false;
    if (pr.record_type === 'DO_CHANGE' || pr.record_type === 'activity') return false;
    if (warehouseFilter === 'All') return true;
    const operatorEmail = pr.operator_email ? pr.operator_email.toLowerCase() : '';
    const wh = warehouseMap[operatorEmail];
    if (warehouseFilter === 'System/Admin') return !wh || operatorEmail === 'system';
    return wh === warehouseFilter;
  });
  return filtered.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, limit);
};

/** Render Sub Admin / Super Admin name + email from decision audit fields. */
const renderDecidedByCell = (row) => {
  if (!row) return '—';
  const name = String(row.decided_by_name || '').trim();
  const email = String(row.decided_by_email || '').trim();
  const role = String(row.decided_by_role || '').trim();
  if (name || email) {
    return (
      <div style={{ lineHeight: 1.35 }}>
        {role ? (
          <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
            {role}
          </div>
        ) : null}
        {name ? (
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{name}</div>
        ) : null}
        {email ? (
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0369a1' }}>{email}</div>
        ) : null}
      </div>
    );
  }
  const label = String(row.decided_by || '').trim();
  return label || '—';
};

const MASTER_SETUP_ACTIONS = new Set([
  'MASTER_SETUP',
  'ADD_CLIENT',
  'DELETE_CLIENT',
  'UPDATE_CLIENT',
  'ADD_CHAMBER',
  'DELETE_CHAMBER',
  'UPDATE_CHAMBER',
  'UPDATE_CHAMBER_ZONE'
]);

const splitCsvNames = (value) =>
  String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const quotedMatch = (text, regex) => {
  const match = String(text || '').match(regex);
  return match ? String(match[1] || '').trim() : '';
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const parseMasterActivity = (act) => {
  const action = String(act?.action || '').toUpperCase();
  const desc = String(act?.description || '');
  const remarkFromDesc = (desc.match(/(?:Remark|Remarks?)\s*:\s*(.+)$/im) || [])[1];
  const remark = String(act?.remark || remarkFromDesc || '').trim();
  const titles = {
    MASTER_SETUP: 'Master Setup saved',
    ADD_CLIENT: 'Client added',
    DELETE_CLIENT: 'Client deactivated',
    UPDATE_CLIENT: 'Client renamed',
    ADD_CHAMBER: 'Chamber added',
    DELETE_CHAMBER: 'Chamber deleted',
    UPDATE_CHAMBER: 'Chamber updated',
    UPDATE_CHAMBER_ZONE: 'Chamber type changed'
  };

  const added = [];
  const deleted = [];
  const renamed = [];
  let typeFrom = quotedMatch(desc, /Chamber type:\s*([A-Za-z]+)\s*→/i);
  let typeTo =
    quotedMatch(desc, /Chamber type:\s*[A-Za-z]+\s*→\s*([A-Za-z]+)/i) ||
    quotedMatch(desc, /updated to "([^"]+)"/i) ||
    quotedMatch(desc, /to "([^"]+)"/i);

  const addedBlock = desc.match(/Client added:\s*([^.]+)/i);
  if (addedBlock) added.push(...splitCsvNames(addedBlock[1]));
  const deletedBlock = desc.match(/Client deleted:\s*([^.]+)/i);
  if (deletedBlock) deleted.push(...splitCsvNames(deletedBlock[1]));
  const renamedBlock = desc.match(/Client renamed:\s*([^.]+)/i);
  if (renamedBlock) {
    renamedBlock[1].split(',').forEach((chunk) => {
      const pair = String(chunk).match(/(.+?)\s*(?:→|->)\s*(.+)/);
      if (pair) renamed.push({ from: pair[1].trim(), to: pair[2].trim() });
    });
  }

  if (action === 'ADD_CLIENT') {
    const name = quotedMatch(desc, /Added client "([^"]+)"/i);
    if (name && !added.includes(name)) added.push(name);
    typeTo = typeTo || quotedMatch(desc, /Added client "[^"]+"\s*\(([^)]+)\)/i);
  }
  if (action === 'DELETE_CLIENT') {
    const name = quotedMatch(desc, /deleted client(?: master)? "([^"]+)"/i);
    if (name && !deleted.includes(name)) deleted.push(name);
  }
  if (action === 'UPDATE_CLIENT') {
    const pair = desc.match(/edited client master "([^"]+)"\s*(?:→|->)\s*"([^"]+)"/i);
    if (pair) renamed.push({ from: pair[1].trim(), to: pair[2].trim() });
  }

  const chamber =
    quotedMatch(desc, /saved Master Setup for ([^.]+?)(?:\.|$)/i) ||
    quotedMatch(desc, /\bto (Chamber\s+\d+)/i) ||
    quotedMatch(desc, /\bon (Chamber\s+\d+)/i) ||
    quotedMatch(desc, /\bfrom (Chamber\s+\d+)/i) ||
    quotedMatch(desc, /deleted chamber "([^"]+)"/i) ||
    quotedMatch(desc, /(?:ADD|added) chamber "([^"]+)"/i) ||
    quotedMatch(desc, /temperature zone of (Chamber\s+\d+)/i) ||
    quotedMatch(desc, /chamber type of (Chamber\s+\d+)/i);

  return {
    action,
    title: titles[action] || action.replace(/_/g, ' '),
    chamber: chamber.replace(/\s+only$/i, '').trim(),
    added,
    deleted,
    renamed,
    typeFrom,
    typeTo,
    remark,
    when: act?.created_at || null,
    summary: desc
  };
};

const pickMasterSetupTimeline = (items) => {
  const rows = Array.isArray(items) ? items : [];
  const setupTimes = rows
    .filter((row) => String(row?.action || '').toUpperCase() === 'MASTER_SETUP')
    .map((row) => new Date(row.created_at).getTime())
    .filter((time) => Number.isFinite(time));
  const batchActions = new Set(['ADD_CLIENT', 'DELETE_CLIENT', 'UPDATE_CLIENT']);

  return rows.filter((row) => {
    const action = String(row?.action || '').toUpperCase();
    if (!MASTER_SETUP_ACTIONS.has(action)) return false;
    if (!batchActions.has(action)) return true;
    const time = new Date(row.created_at).getTime();
    if (!Number.isFinite(time)) return true;
    return !setupTimes.some((setupTime) => Math.abs(setupTime - time) <= 45000);
  }).sort((a, b) => {
    const timeB = new Date(b?.created_at).getTime() || 0;
    const timeA = new Date(a?.created_at).getTime() || 0;
    if (timeB !== timeA) return timeB - timeA;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
};

const activitiesForOperatorEmail = (items, email) => {
  const target = normalizeEmail(email);
  if (!target) return [];
  return pickMasterSetupTimeline(items).filter(
    (row) => normalizeEmail(row.operator_email) === target
  );
};

const MASTER_ACTIVITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'added', label: 'Client added' },
  { id: 'removed', label: 'Client removed' },
  { id: 'renamed', label: 'Client renamed' },
  { id: 'type', label: 'Type change' },
  { id: 'chamber', label: 'Chamber' }
];
const OP_MASTER_ACTIVITY_PAGE_SIZE = 20;

const masterActivityMatchesFilter = (act, filterId) => {
  if (!filterId || filterId === 'all') return true;
  const parsed = parseMasterActivity(act);
  const action = parsed.action;
  if (filterId === 'added') return parsed.added.length > 0 || action === 'ADD_CLIENT';
  if (filterId === 'removed') return parsed.deleted.length > 0 || action === 'DELETE_CLIENT';
  if (filterId === 'renamed') return parsed.renamed.length > 0 || action === 'UPDATE_CLIENT';
  if (filterId === 'type') return Boolean(parsed.typeFrom || parsed.typeTo) || action === 'UPDATE_CHAMBER_ZONE';
  if (filterId === 'chamber') return action === 'ADD_CHAMBER' || action === 'DELETE_CHAMBER' || action === 'UPDATE_CHAMBER';
  return true;
};

const masterActivityTone = (action) => {
  if (action === 'ADD_CLIENT' || action === 'ADD_CHAMBER' || action === 'MASTER_SETUP') {
    return { color: '#047857', bg: '#d1fae5', border: '#a7f3d0' };
  }
  if (action === 'DELETE_CLIENT' || action === 'DELETE_CHAMBER') {
    return { color: '#b91c1c', bg: '#fee2e2', border: '#fecaca' };
  }
  if (action === 'UPDATE_CLIENT' || action === 'UPDATE_CHAMBER' || action === 'UPDATE_CHAMBER_ZONE') {
    return { color: '#a16207', bg: '#fef9c3', border: '#fde68a' };
  }
  return { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' };
};

const renderMasterActivityStructured = (act, { compact = false } = {}) => {
  const parsed = parseMasterActivity(act);
  const tone = masterActivityTone(parsed.action);
  const timeLabel = parsed.when
    ? new Date(parsed.when).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : '';
  const chip = (label, value, color, bg) => (
    <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: compact ? '0.72rem' : '0.78rem' }}>
      <span style={{ minWidth: compact ? 64 : 76, fontWeight: 800, color, background: bg, padding: '1px 6px', borderRadius: 999, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: 1 }}>
        {label}
      </span>
      <span style={{ color: '#334155', fontWeight: 600, lineHeight: 1.45 }}>{value}</span>
    </div>
  );
  const rows = [];
  if (parsed.added.length) rows.push(chip('Added', parsed.added.join(', '), '#047857', '#dcfce7'));
  if (parsed.deleted.length) rows.push(chip('Removed', parsed.deleted.join(', '), '#b91c1c', '#fee2e2'));
  if (parsed.renamed.length) {
    rows.push(chip(
      'Renamed',
      parsed.renamed.map((item) => `${item.from} → ${item.to}`).join(', '),
      '#a16207',
      '#fef9c3'
    ));
  }
  if (parsed.typeFrom || parsed.typeTo) {
    rows.push(chip('Type', parsed.typeFrom && parsed.typeTo ? `${parsed.typeFrom} → ${parsed.typeTo}` : parsed.typeTo || parsed.typeFrom, '#1d4ed8', '#dbeafe'));
  }
  if (parsed.remark) rows.push(chip('Remark', parsed.remark, '#0f766e', '#ccfbf1'));
  if (!rows.length && parsed.summary) {
    rows.push(
      <div key="summary" style={{ fontSize: compact ? '0.72rem' : '0.78rem', color: '#475569', lineHeight: 1.45 }}>
        {highlightAddedDeletedWords(parsed.summary)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: '0.64rem',
            fontWeight: 800,
            color: tone.color,
            backgroundColor: tone.bg,
            textTransform: 'uppercase'
          }}>
            {parsed.title}
          </span>
          {parsed.chamber ? (
            <span style={{ fontSize: compact ? '0.76rem' : '0.82rem', fontWeight: 800, color: '#0f172a' }}>
              {parsed.chamber}
            </span>
          ) : null}
        </div>
        {timeLabel && !compact ? (
          <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>{timeLabel}</span>
        ) : null}
      </div>
      {rows}
    </div>
  );
};

/**
 * WHAT: Root Super Admin layout — sidebar, main viewport, modals, inline DO monitors.
 * WHY: Centralizes CRM, permissions, logs, and operator management for cold-chain ops.
 * HOW: activeMenu switches sections; useEffects load the right API data per menu (see ~3211).
 *      State groups below: navigation, operators/DO profile, activity/history logs, customers,
 *      permissions, inventory/box tracker, exports, and profile/password.
 */
export default function SuperAdminSecureWindow({ user, onLogout, onUserUpdate }) {
  const [time, setTime] = useState(new Date());
  // // Navigation & shell
  const [activeMenu, setActiveMenu] = useState(() => {
    const saved = localStorage.getItem('super_admin_active_menu');
    if (saved === 'user_management') {
      const savedTab = localStorage.getItem('super_admin_user_tab');
      return savedTab === 'operators' ? 'data_operators' : 'customers';
    }
    if (saved === 'sub_admins') return 'customers';
    if (saved === 'customers' || saved === 'data_operators') return saved;
    return saved || 'dashboard';
  });
  const [auditSubTab, setAuditSubTab] = useState(() => {
    return localStorage.getItem('super_admin_audit_sub_tab') || 'activity_log';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ~80% UI scale (same feel as browser zoom out to 80%)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('sa-ui-zoom-80');
    return () => root.classList.remove('sa-ui-zoom-80');
  }, []);

  useEffect(() => {
    localStorage.setItem('super_admin_active_menu', activeMenu);
  }, [activeMenu]);

  useEffect(() => {
    localStorage.setItem('super_admin_audit_sub_tab', auditSubTab);
  }, [auditSubTab]);

  useEffect(() => {
    setProfileEmail(user?.email || '');
    setOldProfileEmail(user?.email || '');
  }, [user?.email]);

  useEffect(() => {
    if (activeMenu === 'super_admin_profile') {
      setProfileAccessId(user?.email || '');
      setProfileAccessPassword('');
      setProfileAccessVerified(false);
      setProfileAccessLoading(false);
      setProfileAccessErr('');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      setProfilePwdMsg('');
      setProfilePwdErr('');
      setShowCurrentAdminPassword(false);
      setShowNewAdminPassword(false);
      setShowConfirmAdminPassword(false);
      setShowProfileConfirm(false);
      setProfileConfirmSummary(null);
      setProfileEmail(user?.email || '');
      setOldProfileEmail(user?.email || '');
      loadAppSubAdminsList();
    }
  }, [activeMenu, user?.email]);

  // Lock background scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Operator CRUD States
  const [operators, setOperators] = useState([]);
  const [loadingOps, setLoadingOps] = useState(false);

  // Data Operator Mappings States
  const [expandedOpMappingsId, setExpandedOpMappingsId] = useState(null);
  const [opMappings, setOpMappings] = useState([]);
  const [opMappingsLoading, setOpMappingsLoading] = useState(false);
  const [opMappingsError, setOpMappingsError] = useState('');
  const [opMappingsSuccess, setOpMappingsSuccess] = useState('');
  const [opMasterActivities, setOpMasterActivities] = useState([]);
  const [opMasterActivitiesLoading, setOpMasterActivitiesLoading] = useState(false);
  const [opMasterActivitiesError, setOpMasterActivitiesError] = useState('');
  const [opMasterActivityFilter, setOpMasterActivityFilter] = useState('all');
  const [opMasterActivityPage, setOpMasterActivityPage] = useState(1);
  const [opMasterFromDate, setOpMasterFromDate] = useState('');
  const [opMasterToDate, setOpMasterToDate] = useState('');
  const [opMasterAppliedFrom, setOpMasterAppliedFrom] = useState('');
  const [opMasterAppliedTo, setOpMasterAppliedTo] = useState('');
  const [opMasterEditMode, setOpMasterEditMode] = useState(false);
  const [opMasterEditChamberKey, setOpMasterEditChamberKey] = useState(null);
  const [opMasterSessionChanges, setOpMasterSessionChanges] = useState([]);
  const [opMasterDonePopup, setOpMasterDonePopup] = useState(null);
  const [denyPermissionModal, setDenyPermissionModal] = useState({
    open: false,
    id: null,
    remark: '',
    busy: false,
    operatorLabel: '',
    summary: ''
  });
  const [newClientInputs, setNewClientInputs] = useState({}); // { [chamberId]: 'clientName' }
  const [newChamberTypes, setNewChamberTypes] = useState({}); // { [chamberId]: 'Frozen' }
  const [addingMappingChamberId, setAddingMappingChamberId] = useState(null); // tracking loading during insert
  const [updatingChamberTypeKey, setUpdatingChamberTypeKey] = useState(null);
  const [deletingOpChamberId, setDeletingOpChamberId] = useState(null);
  const [addingOpChamber, setAddingOpChamber] = useState(false);
  const [opNewChamberName, setOpNewChamberName] = useState('');
  const [opNewChamberType, setOpNewChamberType] = useState('Frozen');
  const [opChamberTypeByNum, setOpChamberTypeByNum] = useState({});
  const [opChambersList, setOpChambersList] = useState([]);
  const [opTaskFromDate, setOpTaskFromDate] = useState('');
  const [opTaskToDate, setOpTaskToDate] = useState('');
  const [opTaskListPage, setOpTaskListPage] = useState(1);
  const [opTimelinePage, setOpTimelinePage] = useState(1);
  const [opTaskAppliedFrom, setOpTaskAppliedFrom] = useState('');
  const [opTaskAppliedTo, setOpTaskAppliedTo] = useState('');
  const [opTaskLogs, setOpTaskLogs] = useState([]);
  const [opTaskLogsLoading, setOpTaskLogsLoading] = useState(false);
  const [opTaskLogsError, setOpTaskLogsError] = useState('');
  const [opIoByDate, setOpIoByDate] = useState({});
  const [opTaskFilter, setOpTaskFilter] = useState('all');
  const [opTaskChamberFilter, setOpTaskChamberFilter] = useState('all');
  const [opMapSearch, setOpMapSearch] = useState('');
  const [opMapChamberFilter, setOpMapChamberFilter] = useState('all');
  const [opMapExpanded, setOpMapExpanded] = useState({});
  const [opEmail, setOpEmail] = useState('');
  const [opPassword, setOpPassword] = useState('');
  const [opFullName, setOpFullName] = useState('');
  const [opPhoneNo, setOpPhoneNo] = useState('');
  const [opWarehouseName, setOpWarehouseName] = useState('');
  const [opWarehouseSuggestOpen, setOpWarehouseSuggestOpen] = useState(false);
  const [opChamberLimit, setOpChamberLimit] = useState(4);
  const [opAssignedChambers, setOpAssignedChambers] = useState(4);
  const [opNotes, setOpNotes] = useState('');
  const [opDirMenuId, setOpDirMenuId] = useState(null);
  const [subAdminNotes, setSubAdminNotes] = useState('');
  const [custDirMenuId, setCustDirMenuId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [oldProfileEmail, setOldProfileEmail] = useState(user?.email || '');
  const [profileAccessId, setProfileAccessId] = useState(user?.email || '');
  const [profileAccessPassword, setProfileAccessPassword] = useState('');
  const [profileAccessVerified, setProfileAccessVerified] = useState(false);
  const [profileAccessLoading, setProfileAccessLoading] = useState(false);
  const [profileAccessErr, setProfileAccessErr] = useState('');
  const [profilePwdLoading, setProfilePwdLoading] = useState(false);
  const [profilePwdMsg, setProfilePwdMsg] = useState('');
  const [profilePwdErr, setProfilePwdErr] = useState('');
  const [showCurrentAdminPassword, setShowCurrentAdminPassword] = useState(false);
  const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);
  const [showConfirmAdminPassword, setShowConfirmAdminPassword] = useState(false);
  const [showProfileConfirm, setShowProfileConfirm] = useState(false);
  const [profileConfirmSummary, setProfileConfirmSummary] = useState(null);

  // Mobile Sub-Admin registration (full app access)
  const [appSubAdmins, setAppSubAdmins] = useState([]);
  const [appSubAdminLoading, setAppSubAdminLoading] = useState(false);
  const [appSubAdminSaving, setAppSubAdminSaving] = useState(false);
  const [appSubAdminMsg, setAppSubAdminMsg] = useState('');
  const [appSubAdminErr, setAppSubAdminErr] = useState('');
  const [appSubFullName, setAppSubFullName] = useState('');
  const [appSubPhone, setAppSubPhone] = useState('');
  const [appSubEmail, setAppSubEmail] = useState('');
  const [appSubPassword, setAppSubPassword] = useState('');
  const [showAppSubPassword, setShowAppSubPassword] = useState(false);
  const [editingOp, setEditingOp] = useState(null);
  const [viewingOperator, setViewingOperator] = useState(null);
  /** DO profile sections: overview | task_status | mappings | master_activity */
  const [opProfileSection, setOpProfileSection] = useState('overview');
  const [opError, setOpError] = useState('');
  const [opSuccess, setOpSuccess] = useState('');
  const [savingOp, setSavingOp] = useState(false);
  const [opProcessStatus, setOpProcessStatus] = useState('');
  const [operatorSearch, setOperatorSearch] = useState('');

  // Activity Logs States (server-paginated)
  const [activities, setActivities] = useState([]);
  const [hasNewDOChanges, setHasNewDOChanges] = useState(false);
  const [lastCheckedDOChanges, setLastCheckedDOChanges] = useState(() => localStorage.getItem('last_checked_do_changes') || '1970-01-01T00:00:00.000Z');
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('All');
  const [logsError, setLogsError] = useState('');
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Activity History Audit Logs States
  const [activitiesSearch, setActivitiesSearch] = useState('');
  const [activitiesFromDate, setActivitiesFromDate] = useState('');
  const [activitiesToDate, setActivitiesToDate] = useState('');
  const [activitiesActionFilter, setActivitiesActionFilter] = useState('All');
  const [activitiesCurrentPage, setActivitiesCurrentPage] = useState(1);
  const [activitiesPerPage] = useState(50);


  // Super Admin History Logs States
  const [historyTab, setHistoryTab] = useState('daily');
  const [chamberLogs, setChamberLogs] = useState([]);
  const [inwardLogs, setInwardLogs] = useState([]);
  const [outwardLogs, setOutwardLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const historyPerPage = 50;
  const [appliedLogsSearch, setAppliedLogsSearch] = useState('');
  const [logsExportLoading, setLogsExportLoading] = useState(false);
  const [logsExportProgressLabel, setLogsExportProgressLabel] = useState('Exporting…');
  const [exportError, setExportError] = useState(null); // { message, retryable, retryKey }
  const exportAbortRef = useRef(null);
  const opMasterActivitiesEmailRef = useRef('');
  const [logsSearch, setLogsSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('All');
  const [historyShiftFilter, setHistoryShiftFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [selectedDetailLog, setSelectedDetailLog] = useState(null);
  const [detailType, setDetailType] = useState('');
  const [recordAllowHistory, setRecordAllowHistory] = useState([]);
  const [loadingAllowHistory, setLoadingAllowHistory] = useState(false);
  /** Photo Preview modal: image URL, zoom level (1–5), drag-to-pan when zoomed. */
  const [lightboxImg, setLightboxImg] = useState(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPanning, setLightboxPanning] = useState(false);
  const lightboxBodyRef = useRef(null);
  const lightboxDragRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  // New photo → reset zoom so each preview starts at 100%.
  useEffect(() => {
    setLightboxZoom(1);
    setLightboxPanning(false);
  }, [lightboxImg]);

  // Ctrl+scroll (or Cmd+scroll) zooms image inside fixed frame; passive:false blocks browser page zoom.
  useEffect(() => {
    const el = lightboxBodyRef.current;
    if (!el || !lightboxImg) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      setLightboxZoom((z) => Math.min(5, Math.max(1, Number((z + delta).toFixed(2)))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [lightboxImg]);

  /** Start drag-pan on the scrollable preview area (only when image is zoomed in). */
  const onLightboxPointerDown = (e) => {
    if (lightboxZoom <= 1) return;
    const el = lightboxBodyRef.current;
    if (!el) return;
    e.preventDefault();
    lightboxDragRef.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop
    };
    setLightboxPanning(true);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  };

  /** While dragging, move scroll position opposite to pointer so image follows the hand. */
  const onLightboxPointerMove = (e) => {
    const drag = lightboxDragRef.current;
    if (!drag.active) return;
    const el = lightboxBodyRef.current;
    if (!el) return;
    el.scrollLeft = drag.left - (e.clientX - drag.x);
    el.scrollTop = drag.top - (e.clientY - drag.y);
  };

  /** End drag-pan and release pointer capture. */
  const onLightboxPointerUp = (e) => {
    if (!lightboxDragRef.current.active) return;
    lightboxDragRef.current.active = false;
    setLightboxPanning(false);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  };
  /** Super Admin direct edit (no permission): { type: 'daily'|'inward'|'outward', data } */
  const [saEditLog, setSaEditLog] = useState(null);
  const [saLogActionBusy, setSaLogActionBusy] = useState(false);
  /** Soft-pending delete for chamber / inward / outward — Undo for 30s */
  const [pendingLogDelete, setPendingLogDelete] = useState(null);
  const pendingLogDeleteRef = useRef(null);
  const pendingLogDeleteTimerRef = useRef(null);
  const pendingLogDeleteTickRef = useRef(null);
  /** Soft-pending revoke for Registered Operators — Undo for 30s */
  const [pendingOperatorDelete, setPendingOperatorDelete] = useState(null);
  const pendingOperatorDeleteRef = useRef(null);
  const pendingOperatorDeleteTimerRef = useRef(null);
  const pendingOperatorDeleteTickRef = useRef(null);
  /** Soft-pending revoke for Customers Directory — Undo for 30s */
  const [pendingCustomerDelete, setPendingCustomerDelete] = useState(null);
  const pendingCustomerDeleteRef = useRef(null);
  const pendingCustomerDeleteTimerRef = useRef(null);
  const pendingCustomerDeleteTickRef = useRef(null);
  /** Soft-pending master mapping delete (chamber / client) — Undo for 30s */
  const [pendingMasterDelete, setPendingMasterDelete] = useState(null);
  const pendingMasterDeleteRef = useRef(null);
  const pendingMasterDeleteTimerRef = useRef(null);
  const pendingMasterDeleteTickRef = useRef(null);

  // Lookup Menu States
  const [lookupQuery, setLookupQuery] = useState('');
  const [searchedRecord, setSearchedRecord] = useState(null);
  const [searchedRecordType, setSearchedRecordType] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [copiedRef, setCopiedRef] = useState(null);

  const formatDateStr = (dateVal) => {
    if (!dateVal) return '-';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return dateVal;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    } catch {
      return dateVal;
    }
  };

  const formatDateTimeStr = (dateVal) => {
    if (!dateVal) return '-';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return dateVal;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
    } catch {
      return dateVal;
    }
  };

  /** Show Updated At only when record was really edited after create; else '-'. */
  const formatUpdatedAtStr = (created, updated) => {
    if (!created || !updated) return '-';
    const cTime = Math.floor(new Date(created).getTime() / 1000);
    const uTime = Math.floor(new Date(updated).getTime() / 1000);
    if (!(uTime > cTime)) return '-';
    return formatDateTimeStr(updated);
  };

  /** Shorten long file paths for readable update diffs */
  const shortenUpdateValue = (val) => {
    const s = String(val ?? '').trim();
    if (!s || s === 'N/A') return 'N/A';
    if (s.includes('/') || s.includes('\\')) {
      const name = s.split(/[/\\]/).pop();
      return name ? `…/${name}` : s;
    }
    return s.length > 48 ? `${s.slice(0, 45)}…` : s;
  };

  /**
   * Parses "Field: old → new, Field2: old2 → new2" into readable rows.
   * Also supports →, -> and pipe-separated multi-update history.
   */
  const parseUpdateDetails = (raw) => {
    if (!raw || !String(raw).trim()) return [];
    const text = String(raw).trim();
    // Split multi-edit history segments first
    const segments = text.split(/\s*\|\s*/);
    const rows = [];
    segments.forEach((segment) => {
      const parts = String(segment).split(/\s*,\s*(?=[^,:]+:\s)/);
      parts.forEach((part) => {
        const arrowMatch = part.match(/^(.*?):\s*(.*?)\s*(?:→|→|->)\s*(.*)$/);
        if (arrowMatch) {
          rows.push({
            field: arrowMatch[1].trim(),
            from: shortenUpdateValue(arrowMatch[2]),
            to: shortenUpdateValue(arrowMatch[3])
          });
          return;
        }
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) {
          if (part.trim()) rows.push({ field: 'Change', from: '—', to: shortenUpdateValue(part) });
          return;
        }
        rows.push({
          field: part.slice(0, colonIdx).trim(),
          from: '—',
          to: shortenUpdateValue(part.slice(colonIdx + 1))
        });
      });
    });
    return rows.filter((row) => row.field);
  };

  const renderFieldCompareTable = (rows, { title = 'What Changed (Before → After)' } = {}) => {
    if (!rows || rows.length === 0) return null;
    const labelMap = {
      box_temp: 'Box Temperature',
      chamber_temp: 'Box Temperature',
      box_count: 'Box Count',
      client_name: 'Client Name',
      chamber_name: 'Chamber Name',
      chamber_type: 'Chamber Type',
      inspection_time: 'Inspection Time',
      shift: 'Shift',
      entry_date: 'Entry Date',
      monitor_supervisor_name: 'Supervisor Name',
      remarks: 'Remarks',
      overdue_time: 'Submission Delay',
      photo_capture_time: 'Photo Capture Time',
      temp_sensor_image: 'Sensor Photo',
      update_time: 'Update Time'
    };
    const nice = (field) => {
      const k = String(field || '').trim();
      return labelMap[k] || labelMap[k.toLowerCase()] || k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>
          {title}
        </div>
        <div
          style={{
            width: '100%',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            overflow: 'hidden',
            backgroundColor: '#f8fafc'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.15fr 1fr 1fr',
              padding: '10px 12px',
              backgroundColor: '#dbeafe',
              borderBottom: '1px solid #bfdbfe',
              fontSize: '0.7rem',
              fontWeight: 800,
              color: '#1e3a8a',
              textTransform: 'uppercase'
            }}
          >
            <span>Field</span>
            <span>Before</span>
            <span>After</span>
          </div>
          {rows.map((row, idx) => (
            <div
              key={`${row.field}-${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.15fr 1fr 1fr',
                gap: 10,
                padding: '11px 12px',
                borderBottom: idx === rows.length - 1 ? 'none' : '1px solid #e2e8f0',
                backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc'
              }}
            >
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>{nice(row.field)}</span>
              <span style={{ fontSize: '0.82rem', color: '#b91c1c', textDecoration: 'line-through', wordBreak: 'break-word' }}>
                {row.from}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#15803d', wordBreak: 'break-word' }}>
                {row.to}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderUpdateDetailsReadable = (raw) => {
    const rows = parseUpdateDetails(raw);
    if (rows.length === 0) {
      return (
        <span className="profile-value" style={{ color: 'var(--text-muted)' }}>
          — No field changes recorded —
        </span>
      );
    }
    return renderFieldCompareTable(rows, { title: 'Update Details — Before → After' });
  };

  const resolveShiftLabel = (shift, inspectionTime, createdAt) => {
    const s = String(shift || '').trim();
    if (/^morning$/i.test(s)) return 'Morning';
    if (/^evening$/i.test(s)) return 'Evening';

    const t = String(inspectionTime || '').trim();
    const tUp = t.toUpperCase();
    if (/^10:00\b/.test(t) || tUp === '10:00 AM') return 'Morning';
    if (/^16:00\b|^18:00\b/.test(t) || tUp.includes('04:00 PM') || tUp.includes('06:00 PM')) {
      return 'Evening';
    }

    const hm = t.match(/^(\d{1,2}):(\d{2})/);
    if (hm) {
      let h = parseInt(hm[1], 10);
      if (tUp.includes('PM') && h < 12) h += 12;
      if (tUp.includes('AM') && h === 12) h = 0;
      return h < 14 ? 'Morning' : 'Evening';
    }

    if (createdAt) {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) return d.getHours() < 14 ? 'Morning' : 'Evening';
    }
    return 'Morning';
  };

  const formatPhotoGpsLink = (lat, lng, accuracy) => (
    <PhotoGpsLink lat={lat} lng={lng} accuracy={accuracy} />
  );

  const renderPhotoCaptureMetadataPanel = (raw) => (
    <PhotoCaptureMetaPanel metadata={raw} />
  );

  /** Chamber log detail — Quick Summary first, then full fields + update compare */
  const renderChamberLogFormView = (log, { enableCopyRef = false } = {}) => {
    if (!log) return null;
    const tempVal = log.chamber_temp ?? log.box_temp;
    const chamberType =
      pickComplianceZone(log.chamber_type) || String(log.chamber_type || '').trim() || 'Frozen';
    const tempDeviation = getChamberTempDeviation(tempVal, chamberType);
    const tempOutOfRange = tempDeviation != null;
    const tempRange = getChamberTempRange(chamberType);
    const tempAlertColor = '#b91c1c';
    const tempOkColor = '#15803d';
    const typeLabel =
      tempDeviation === 'low'
        ? `< ${chamberType}`
        : tempDeviation === 'high'
          ? `> ${chamberType}`
          : chamberType;
    const shiftLabel = resolveShiftLabel(log.shift, log.inspection_time, log.created_at);
    const updateRows = parseUpdateDetails(log.update_details);
    const hasUpdates = Number(log.update_count) > 0 || updateRows.length > 0;
    const entryDate = formatDateStr(log.formatted_date || log.entry_date) || '-';
    const boxCount =
      log.box_count !== undefined && log.box_count !== null ? String(log.box_count) : '-';

    const formField = (label, value, opts = {}) => (
      <div className="profile-item" style={opts.full ? { gridColumn: 'span 2' } : undefined}>
        <span className="profile-label">{label}</span>
        <span className="profile-value" style={opts.valueStyle || undefined}>
          {value}
        </span>
      </div>
    );

    const refNode = enableCopyRef ? (
      <span
        onClick={() => {
          if (log.reference_no) {
            navigator.clipboard.writeText(log.reference_no);
            setCopiedRef(log.reference_no);
            setTimeout(() => setCopiedRef(null), 1500);
          }
        }}
        title="Click to copy Reference Number"
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: 700,
          color: copiedRef === log.reference_no ? '#10b981' : 'var(--primary)'
        }}
      >
        {log.reference_no || '-'}
        {log.reference_no && (
          copiedRef === log.reference_no ? <Check size={12} color="#10b981" /> : <Copy size={10} style={{ opacity: 0.5 }} />
        )}
      </span>
    ) : (
      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{log.reference_no || '-'}</span>
    );

    return (
      <>
        <div
          className="profile-group-card"
          style={{
            background: 'linear-gradient(135deg, #f0f9ff 0%, #f8fafc 100%)',
            border: '1px solid #bae6fd'
          }}
        >
          <div className="profile-group-title" style={{ color: '#0369a1' }}>
            Quick Summary
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12
            }}
          >
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Client Name</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>{log.client_name || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Chamber</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>{log.chamber_name || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Date</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>{entryDate}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Time / Shift</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                {log.inspection_time || '-'} · {shiftLabel}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Temperature</div>
              <div
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  marginTop: 2,
                  color: tempVal == null ? '#0f172a' : tempOutOfRange ? tempAlertColor : tempOkColor
                }}
              >
                {tempVal != null ? `${tempVal}°C` : '-'}
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  marginTop: 2,
                  color: tempOutOfRange ? tempAlertColor : '#64748b'
                }}
              >
                {typeLabel}
                {tempOutOfRange && tempRange ? ` · ${tempRange.label}` : ''}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Boxes</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>{boxCount}</div>
            </div>
          </div>

          {hasUpdates ? (
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: '#fff7ed',
                border: '1px solid #fed7aa'
              }}
            >
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c2410c', marginBottom: 4 }}>
                Updated {Number(log.update_count) > 0 ? log.update_count : updateRows.length}{' '}
                {Number(log.update_count) === 1 ? 'time' : 'times'}
                {formatUpdatedAtStr(log.created_at, log.updated_at) !== '-'
                  ? ` · Last: ${formatUpdatedAtStr(log.created_at, log.updated_at)}`
                  : ''}
              </div>
              {updateRows.length > 0
                ? renderFieldCompareTable(updateRows, { title: 'Before → After' })
                : (
                  <div style={{ fontSize: '0.78rem', color: '#9a3412' }}>
                    This record was updated, but field-level before/after details were not saved.
                  </div>
                )}
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>
              No updates yet — original submitted values below.
            </div>
          )}
        </div>

        <div className="profile-group-card">
          <div className="profile-group-title">Full Log Details</div>
          <div className="profile-grid-list">
            {formField('Entry Date', entryDate)}
            {formField('Reference No', refNode)}
            {formField('Client Name', log.client_name || '-')}
            {formField('Chamber Name', log.chamber_name || '-')}
            {formField('Chamber Type', typeLabel, {
              valueStyle: tempOutOfRange
                ? { fontWeight: 800, color: tempAlertColor }
                : undefined
            })}
            {formField('Inspection Time', log.inspection_time || '-')}
            {formField('Shift', shiftLabel)}
            {formField(
              'Box Temp (°C)',
              tempVal != null ? `${tempVal}°C` : '-',
              {
                valueStyle: {
                  fontWeight: 700,
                  color:
                    tempVal == null
                      ? undefined
                      : tempOutOfRange
                        ? tempAlertColor
                        : tempOkColor
                }
              }
            )}
            {tempOutOfRange && tempRange
              ? formField(
                  'Compliance',
                  `${tempDeviation === 'low' ? '< kam' : '> zyada'} · allowed ${tempRange.label}`,
                  { valueStyle: { fontWeight: 700, color: tempAlertColor }, full: true }
                )
              : null}
            {formField('Box Count', boxCount)}
            {formField('Supervisor Name', log.monitor_supervisor_name || '-')}
            {formField('Warehouse', log.warehouse_name || 'Generic')}
            {formField('Operator', renderOperatorEmail(log.operator_email))}
            {formField(
              'Photo Capture Time',
              log.photo_capture_time ? formatDateTimeStr(log.photo_capture_time) : '-'
            )}
            {formField(
              'Photo Location',
              formatPhotoGpsLink(
                log.photo_capture_latitude,
                log.photo_capture_longitude,
                log.photo_capture_accuracy
              )
            )}
            {formField(
              'Time Variance',
              log.time_variance_minutes !== undefined && log.time_variance_minutes !== null
                ? `${log.time_variance_minutes} mins`
                : '-'
            )}
            {formField('Submission Delay', log.overdue_time || 'same day', {
              valueStyle:
                log.overdue_time && log.overdue_time !== 'same day'
                  ? { color: '#dc2626', fontWeight: 700 }
                  : undefined
            })}
            {formField('Source', Number(log.is_native) === 1 ? 'Mobile Native App' : 'Web / Monitor')}
            {formField('Created At', formatDateTimeStr(log.created_at) || '-')}
            {formField('Updated At', formatUpdatedAtStr(log.created_at, log.updated_at))}
            {formField(
              'Update Count',
              Number(log.update_count) > 0 ? String(log.update_count) : '0'
            )}
            {formField('Remarks', log.remarks || '—', { full: true })}
          </div>
        </div>
      </>
    );
  };

  // Security & Access Logs States
  const [securitySearch, setSecuritySearch] = useState('');
  const [securityFromDate, setSecurityFromDate] = useState('');
  const [securityToDate, setSecurityToDate] = useState('');
  const [securityActionFilter, setSecurityActionFilter] = useState('All');
  const [securityCurrentPage, setSecurityCurrentPage] = useState(1);
  const [securityPerPage] = useState(50);

  // System & Error Logs States
  const [systemSearch, setSystemSearch] = useState('');
  const [systemFromDate, setSystemFromDate] = useState('');
  const [systemToDate, setSystemToDate] = useState('');
  const [systemActionFilter, setSystemActionFilter] = useState('All');
  const [systemCurrentPage, setSystemCurrentPage] = useState(1);
  const [systemPerPage] = useState(50);

  const [dashboardStats, setDashboardStats] = useState({
    totalLeads: 0,
    totalSubAdmins: 0,
    totalOperators: 0
  });
  const [doTaskOverview, setDoTaskOverview] = useState(null);
  const [loadingDoTasks, setLoadingDoTasks] = useState(false);
  const [doTaskError, setDoTaskError] = useState('');
  const [doTaskFilter, setDoTaskFilter] = useState('all');
  const [doTaskSearch, setDoTaskSearch] = useState('');
  const [doTaskFromDate, setDoTaskFromDate] = useState(() => getDefaultOpTaskRange(7).fromDate);
  const [doTaskToDate, setDoTaskToDate] = useState(() => getDefaultOpTaskRange(7).toDate);

  // Inventory Log States
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryWarehouseFilter, setInventoryWarehouseFilter] = useState('All');
  const [inventoryDiscrepancyFilter, setInventoryDiscrepancyFilter] = useState(false);
  const [inventorySubView, setInventorySubView] = useState('main'); // 'main' | 'breakdown'
  const [breakdownCurrentPage, setBreakdownCurrentPage] = useState(1);
  const [breakdownPerPage] = useState(15);

  /**
   * Daily Box Tracker (Super Admin menu: daily_box_tracker)
   * - List: one row per client + warehouse (Left Now from physical audit or book balance)
   * - Detail: day-wise Received / Dispatch / Left (API: getClientMonthBoxSheet)
   * - Browser Back: pushState when opening detail so mouse back closes detail view
   */
  const [inventoryFilterOptions, setInventoryFilterOptions] = useState({ warehouses: [], total_warehouses: 0, total_clients: 0 });
  const [dailyDeltas, setDailyDeltas] = useState([]);
  const [loadingDeltas, setLoadingDeltas] = useState(false);
  const [deltasError, setDeltasError] = useState('');
  const [deltasWarehouseFilter, setDeltasWarehouseFilter] = useState('All');
  const [deltasClientFilter, setDeltasClientFilter] = useState('All');
  const [deltasCurrentPage, setDeltasCurrentPage] = useState(1);
  const [deltasPerPage] = useState(15);
  const [deltasViewClient, setDeltasViewClient] = useState(null); // selected row for View detail
  const [clientMonthSheet, setClientMonthSheet] = useState(null); // { meta, days }
  const [loadingMonthSheet, setLoadingMonthSheet] = useState(false);
  const [monthSheetError, setMonthSheetError] = useState('');
  const [monthSheetFromDate, setMonthSheetFromDate] = useState('');
  const [monthSheetToDate, setMonthSheetToDate] = useState('');
  const [monthSheetPage, setMonthSheetPage] = useState(1);
  const [monthSheetPerPage] = useState(15);
  const boxDayHistoryRef = useRef(false);
  const deltasViewClientRef = useRef(null);
  deltasViewClientRef.current = deltasViewClient;

  /** Clears client day-detail view state (list view stays on Daily Box Tracker). */
  const resetClientMonthSheetState = () => {
    setDeltasViewClient(null);
    setClientMonthSheet(null);
    setMonthSheetError('');
    setLoadingMonthSheet(false);
    setMonthSheetFromDate('');
    setMonthSheetToDate('');
    setMonthSheetPage(1);
  };

  /**
   * Close day-detail and return to client list.
   * Uses history.back() when we pushed a state on open, so browser Back button works the same as UI Back.
   */
  const closeClientMonthSheet = (opts = {}) => {
    const fromPopstate = !!opts?.fromPopstate;
    if (!fromPopstate && boxDayHistoryRef.current) {
      try {
        window.history.back();
        return;
      } catch (_) {
        /* fall through and reset locally */
      }
    }
    boxDayHistoryRef.current = false;
    resetClientMonthSheetState();
  };

  /**
   * Open day-wise Received/Dispatch/Left for one client row.
   * Fetches /dashboard/client-month-box-sheet and pushes browser history for Back support.
   */
  const openClientMonthSheet = async (row, rangeOverride) => {
    if (!row?.client_name) return;
    const defaults = getDefaultOpTaskRange(30);
    const fromDate = toApiDateParam(
      rangeOverride?.fromDate ?? (monthSheetFromDate || defaults.fromDate)
    );
    const toDate = toApiDateParam(
      rangeOverride?.toDate ?? (monthSheetToDate || defaults.toDate)
    );
    setMonthSheetFromDate(fromDate);
    setMonthSheetToDate(toDate);
    setMonthSheetPage(1);
    setDeltasViewClient(row);
    setClientMonthSheet(null);
    setMonthSheetError('');
    setLoadingMonthSheet(true);

    // Enable browser / mouse Back to return to lot list
    if (!boxDayHistoryRef.current) {
      try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('saBoxDay', '1');
        window.history.pushState(
          { saBoxDayDetail: true, client: row.client_name },
          '',
          nextUrl.toString()
        );
        boxDayHistoryRef.current = true;
      } catch (_) {
        try {
          window.history.pushState({ saBoxDayDetail: true }, '');
          boxDayHistoryRef.current = true;
        } catch (__) {
          boxDayHistoryRef.current = false;
        }
      }
    }

    try {
      const data = await fetchClientMonthBoxSheet({
        client: row.client_name,
        warehouse: row.warehouse_name || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });
      setClientMonthSheet(data);
    } catch (err) {
      console.error('Failed to load client month box sheet:', err);
      setMonthSheetError(err.message || 'Failed to load 1-month box sheet.');
    } finally {
      setLoadingMonthSheet(false);
    }
  };

  // Browser Back / mouse back: close detail when user pops our pushState entry.
  useEffect(() => {
    const onPopState = () => {
      if (!boxDayHistoryRef.current && !deltasViewClientRef.current) return;
      boxDayHistoryRef.current = false;
      resetClientMonthSheetState();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // User switched SA menu away from Daily Box Tracker — clear detail without extra history.back().
  useEffect(() => {
    if (activeMenu === 'daily_box_tracker') return;
    if (!boxDayHistoryRef.current && !deltasViewClientRef.current) return;
    boxDayHistoryRef.current = false;
    resetClientMonthSheetState();
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('saBoxDay')) {
        u.searchParams.delete('saBoxDay');
        window.history.replaceState(window.history.state, '', u.toString());
      }
    } catch (_) {
      /* ignore */
    }
  }, [activeMenu]);

  /** Loads warehouse/client filter options + reconciliation rows for the tracker table. */
  const loadDailyBoxTrackerData = async (warehouseOverride) => {
    const warehouse = warehouseOverride !== undefined ? warehouseOverride : deltasWarehouseFilter;
    setLoadingDeltas(true);
    setDeltasError('');
    try {
      const [filterData, reconRows] = await Promise.all([
        fetchInventoryFilterOptions(),
        fetchInventoryReconciliation({
          warehouse: warehouse && warehouse !== 'All' ? warehouse : undefined,
          offset: 0,
          limit: 200
        })
      ]);
      setInventoryFilterOptions({
        warehouses: Array.isArray(filterData?.warehouses) ? filterData.warehouses : [],
        total_warehouses: Number(filterData?.total_warehouses) || 0,
        total_clients: Number(filterData?.total_clients) || 0
      });
      setDailyDeltas(Array.isArray(reconRows) ? reconRows : []);
      setDeltasCurrentPage(1);
    } catch (err) {
      console.error('Failed to load Daily Box Tracker data:', err);
      setDeltasError(err.message || 'Failed to load warehouse inventory data.');
      setInventoryFilterOptions({ warehouses: [], total_warehouses: 0, total_clients: 0 });
      setDailyDeltas([]);
    } finally {
      setLoadingDeltas(false);
    }
  };

  const loadInventoryReconciliationData = async () => {
    setLoadingInventory(true);
    setInventoryError('');
    try {
      const data = await fetchInventoryReconciliation({
        search: inventorySearch.trim(),
        warehouse: inventoryWarehouseFilter
      });
      setInventoryLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch inventory logs:', err);
      setInventoryError(err.message || 'Failed to fetch inventory reconciliation logs.');
      setInventoryLogs([]);
    } finally {
      setLoadingInventory(false);
    }
  };


  // Customers Management States
  const [subAdmins, setSubAdmins] = useState([]);
  const [subAdminSearch, setSubAdminSearch] = useState('');
  const [loadingSubAdmins, setLoadingSubAdmins] = useState(false);
  const [subAdminSuccess, setSubAdminSuccess] = useState('');
  const [subAdminError, setSubAdminError] = useState('');
  const [savingSubAdmin, setSavingSubAdmin] = useState(false);
  const [subAdminProcessStatus, setSubAdminProcessStatus] = useState('');
  const [subAdminEmail, setSubAdminEmail] = useState('');
  const [subAdminPassword, setSubAdminPassword] = useState('');
  const [subAdminFullName, setSubAdminFullName] = useState('');
  const [subAdminPhoneNo, setSubAdminPhoneNo] = useState('');
  const [editingSubAdmin, setEditingSubAdmin] = useState(null);

  // Access Scope States (Client & Warehouse restrictions)
  const [accessScopeOptions, setAccessScopeOptions] = useState({
    clients: [],
    warehouses: [],
    warehouseClients: {},
    warehouseMasters: [],
    clientMasters: []
  });
  const [subAdminSelectedClients, setSubAdminSelectedClients] = useState([]);
  const [subAdminSelectedWarehouses, setSubAdminSelectedWarehouses] = useState([]);

  // Customer Reports (from Customer portal → customer_reports table)
  const [customerReports, setCustomerReports] = useState([]);
  const [loadingCustomerReports, setLoadingCustomerReports] = useState(false);
  const [customerReportsError, setCustomerReportsError] = useState('');
  const [customerReportSearch, setCustomerReportSearch] = useState('');
  const [customerReportStatusFilter, setCustomerReportStatusFilter] = useState('All');
  const [updatingReportId, setUpdatingReportId] = useState(null);
  const [customerReportsTab, setCustomerReportsTab] = useState('issues'); // issues | notes
  const [noteThreads, setNoteThreads] = useState([]);
  const [noteMessages, setNoteMessages] = useState([]);
  const [selectedNoteCustomer, setSelectedNoteCustomer] = useState('All');
  const [noteDraft, setNoteDraft] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [notesError, setNotesError] = useState('');
  const notesChatEndRef = useRef(null);

  // Real-time ticking clock for header
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadCustomerReportsData = async () => {
    setLoadingCustomerReports(true);
    setCustomerReportsError('');
    try {
      const data = await fetchCustomerReports({
        status: customerReportStatusFilter,
        search: customerReportSearch.trim()
      });
      setCustomerReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch customer reports:', err);
      setCustomerReportsError(err.message || 'Failed to fetch customer reports.');
      setCustomerReports([]);
    } finally {
      setLoadingCustomerReports(false);
    }
  };

  const handleUpdateCustomerReportStatus = async (id, status) => {
    setUpdatingReportId(id);
    setCustomerReportsError('');
    try {
      await updateCustomerReportStatus(id, status);
      await loadCustomerReportsData();
    } catch (err) {
      setCustomerReportsError(err.message || 'Failed to update status.');
    } finally {
      setUpdatingReportId(null);
    }
  };

  const handleDeleteCustomerReport = async (id) => {
    if (!window.confirm('Delete this customer report permanently?')) return;
    setUpdatingReportId(id);
    setCustomerReportsError('');
    try {
      await deleteCustomerReport(id);
      await loadCustomerReportsData();
    } catch (err) {
      setCustomerReportsError(err.message || 'Failed to delete report.');
    } finally {
      setUpdatingReportId(null);
    }
  };

  const loadNoteThreads = async () => {
    setLoadingNotes(true);
    setNotesError('');
    try {
      const data = await fetchCustomerNoteThreads();
      setNoteThreads(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotesError(err.message || 'Failed to load note threads.');
      setNoteThreads([]);
    } finally {
      setLoadingNotes(false);
    }
  };

  const loadNoteMessages = async (email) => {
    const clean = String(email || '').trim();
    setLoadingNotes(true);
    setNotesError('');
    try {
      const data =
        !clean || clean === 'All'
          ? await fetchCustomerNotes({})
          : await fetchCustomerNotes({ customer_email: clean.toLowerCase() });
      setNoteMessages(Array.isArray(data) ? data : []);
      setTimeout(() => notesChatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' }), 80);
    } catch (err) {
      setNotesError(err.message || 'Failed to load notes.');
      setNoteMessages([]);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleSelectNoteCustomer = async (email) => {
    const raw = String(email || '').trim();
    const clean = raw === 'All' || !raw ? 'All' : raw.toLowerCase();
    setSelectedNoteCustomer(clean);
    setNoteDraft('');
    await loadNoteMessages(clean);
  };

  const handleSendCustomerNote = async () => {
    const msg = String(noteDraft || '').trim();
    if (!msg) {
      setNotesError('Type a note message.');
      return;
    }
    const isBroadcast = !selectedNoteCustomer || selectedNoteCustomer === 'All';
    setSendingNote(true);
    setNotesError('');
    try {
      if (isBroadcast) {
        let customers = Array.isArray(subAdmins) ? subAdmins : [];
        if (!customers.length) {
          try {
            customers = (await fetchSubAdmins()) || [];
            setSubAdmins(customers);
          } catch (_) {
            /* keep empty */
          }
        }
        const emails = [
          ...new Set(
            customers
              .map((c) => String(c?.email || '').trim().toLowerCase())
              .filter(Boolean)
          )
        ];
        if (!emails.length) {
          setNotesError('No customers found. Add customers first, then send to All.');
          return;
        }
        const ok = window.confirm(
          `All customers selected.\n\nSend this note to ${emails.length} customer(s)?`
        );
        if (!ok) return;

        // Prefer server broadcast; if unavailable, send one note per customer.
        let sentCount = 0;
        try {
          const result = await postCustomerNote({
            message: msg,
            broadcast: true,
            customer_email: 'All'
          });
          sentCount = Number(result?.count) || emails.length;
        } catch (_) {
          for (const email of emails) {
            await postCustomerNote({ customer_email: email, message: msg });
            sentCount += 1;
          }
        }

        setNoteDraft('');
        await Promise.all([loadNoteMessages('All'), loadNoteThreads()]);
        window.alert(`Note sent to ${sentCount} customer(s).`);
      } else {
        await postCustomerNote({ customer_email: selectedNoteCustomer, message: msg });
        setNoteDraft('');
        await Promise.all([loadNoteMessages(selectedNoteCustomer), loadNoteThreads()]);
      }
    } catch (err) {
      setNotesError(err.message || 'Failed to send note.');
    } finally {
      setSendingNote(false);
    }
  };

  const handleDeleteCustomerNote = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteCustomerNote(id);
      await Promise.all([loadNoteMessages(selectedNoteCustomer), loadNoteThreads()]);
    } catch (err) {
      setNotesError(err.message || 'Failed to delete note.');
    }
  };



  const loadOperatorsData = async () => {
    setLoadingOps(true);
    setOpError('');
    try {
      const data = await fetchOperators();
      const list = Array.isArray(data) ? data : [];
      setOperators(list);
      setViewingOperator((prev) => {
        if (!prev?.id) return prev;
        const next = list.find((o) => Number(o.id) === Number(prev.id));
        if (!next) return prev;
        return {
          ...prev,
          ...next,
          total_inward: Number(next.total_inward ?? prev.total_inward) || 0,
          total_outward: Number(next.total_outward ?? prev.total_outward) || 0,
          today_inward: Number(next.today_inward ?? prev.today_inward) || 0,
          today_outward: Number(next.today_outward ?? prev.today_outward) || 0
        };
      });
    } catch (err) {
      setOpError(err.message || 'Failed to fetch operators.');
    } finally {
      setLoadingOps(false);
    }
  };

  const loadOpMappings = async (warehouseName, { silent = false } = {}) => {
    if (!warehouseName) {
      setOpMappings([]);
      setOpChamberTypeByNum({});
      return;
    }
    if (!silent) {
      setOpMappingsLoading(true);
      setOpMappingsError('');
      setOpMappingsSuccess('');
    }
    try {
      const [data, chambers] = await Promise.all([
        fetchChamberAssignments(warehouseName),
        fetchChambers().catch(() => [])
      ]);
      const typeByNum = {};
      (Array.isArray(chambers) ? chambers : []).forEach((c) => {
        const num = chamberNumberFromName(c.name || c.chamber_name);
        if (num == null) return;
        typeByNum[num] = String(c.chamber_type || c.chamberType || 'Frozen').trim() || 'Frozen';
      });
      setOpChamberTypeByNum(typeByNum);
      setOpChambersList(Array.isArray(chambers) ? chambers : []);
      setOpMappings(dedupeChamberAssignments(Array.isArray(data) ? data : []));
    } catch (err) {
      setOpMappingsError(err.message || 'Failed to load chamber client mappings.');
    } finally {
      if (!silent) setOpMappingsLoading(false);
    }
  };

  const refreshOperatorProfileMaster = async (op, successMessage = '') => {
    if (!op?.warehouse_name) return;
    await loadOpMappings(op.warehouse_name, { silent: true });
    if (successMessage) setOpMappingsSuccess(successMessage);
  };

  const finishOpMasterEdit = async (op) => {
    const pendingBefore = pendingMasterDeleteRef.current;
    if (pendingBefore) {
      await finalizePendingMasterDelete();
    }
    const changes = Array.isArray(opMasterSessionChanges) ? [...opMasterSessionChanges] : [];
    if (pendingBefore) {
      const text =
        pendingBefore.kind === 'chamber'
          ? `Deleted ${pendingBefore.chamberName || pendingBefore.label}.`
          : `Removed "${pendingBefore.clientName}" from ${pendingBefore.chamberName}.`;
      if (!changes.some((c) => c.text === text)) {
        changes.push({ kind: 'remove', text });
      }
    }
    setOpMasterEditMode(false);
    setOpMasterEditChamberKey(null);
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setOpMasterDonePopup({
      operatorName: op?.full_name || op?.email || 'Data Operator',
      warehouseName: op?.warehouse_name || '',
      changes
    });
    setOpMasterSessionChanges([]);
    setNewClientInputs({});
    setNewChamberTypes({});
    setOpNewChamberName('');
    setOpNewChamberType('Frozen');
    if (op?.email) {
      await loadOpMasterActivities(op.email);
    }
  };

  const cancelOpMasterEdit = () => {
    setOpMasterEditMode(false);
    setOpMasterEditChamberKey(null);
    setOpMasterSessionChanges([]);
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setNewClientInputs({});
    setNewChamberTypes({});
    setOpNewChamberName('');
    setOpNewChamberType('Frozen');
  };

  const clearPendingMasterDeleteTimers = () => {
    if (pendingMasterDeleteTimerRef.current) {
      clearTimeout(pendingMasterDeleteTimerRef.current);
      pendingMasterDeleteTimerRef.current = null;
    }
    if (pendingMasterDeleteTickRef.current) {
      clearInterval(pendingMasterDeleteTickRef.current);
      pendingMasterDeleteTickRef.current = null;
    }
  };

  const mappingMatchesPendingClient = (row, pending) => {
    if (!row || !pending) return false;
    const sameClient =
      String(row.client_name || '').trim().toLowerCase() ===
      String(pending.clientName || '').trim().toLowerCase();
    if (!sameClient) return false;
    if (pending.chamberId != null && Number(row.chamber_id) === Number(pending.chamberId)) return true;
    const rowNum = chamberNumberFromName(row.chamber_name);
    const pendingNum = chamberNumberFromName(pending.chamberName);
    return rowNum != null && pendingNum != null && rowNum === pendingNum;
  };

  const mappingBelongsToPendingChamber = (row, pending) => {
    if (!row || !pending) return false;
    if (pending.chamberId != null && Number(row.chamber_id) === Number(pending.chamberId)) return true;
    const rowNum = chamberNumberFromName(row.chamber_name);
    const pendingNum = chamberNumberFromName(pending.chamberName);
    return rowNum != null && pendingNum != null && rowNum === pendingNum;
  };

  const restorePendingMasterToUi = (pending) => {
    if (!pending) return;
    if (pending.kind === 'chamber') {
      if (pending.chamberRecord) {
        setOpChambersList((prev) =>
          prev.some((c) => Number(c.id) === Number(pending.chamberId))
            ? prev
            : [pending.chamberRecord, ...prev]
        );
      }
      if (Array.isArray(pending.mappings) && pending.mappings.length) {
        setOpMappings((prev) => {
          const keys = new Set((prev || []).map(assignmentClientKey));
          const restored = pending.mappings.filter((m) => !keys.has(assignmentClientKey(m)));
          return restored.length ? [...restored, ...(prev || [])] : prev;
        });
      }
      return;
    }
    if (pending.kind === 'client' && pending.assignment) {
      setOpMappings((prev) => {
        if ((prev || []).some((m) => mappingMatchesPendingClient(m, pending))) return prev;
        return [pending.assignment, ...(prev || [])];
      });
    }
  };

  const commitPendingMasterDelete = async (pending) => {
    if (!pending?.op) return;
    const op = pending.op;
    try {
      if (pending.kind === 'chamber') {
        const chambers = await fetchChambers().catch(() => []);
        const resolvedId =
          resolveChamberIdFromList(chambers, pending.chamberId, pending.chamberName) || pending.chamberId;
        await deleteChamber(
          resolvedId,
          `Deleted by Super Admin from ${op.full_name || op.email} details`
        );
        const deletedLabel = `Deleted ${pending.chamberName || `Chamber ${pending.chamberId}`}.`;
        pushOpMasterChange('remove', deletedLabel);
        setOpMappingsSuccess(deletedLabel);
        if (op.email) await loadOpMasterActivities(op.email);
        return;
      }
      if (pending.kind === 'client') {
        const chambers = await fetchChambers().catch(() => []);
        const resolvedId = resolveChamberIdFromList(
          chambers,
          pending.chamberId,
          pending.chamberName
        );
        await deleteChamberAssignment({
          chamber_id: resolvedId,
          client_name: pending.clientName,
          remark: 'Removed by Super Admin',
          warehouse_name: op.warehouse_name,
          operator_email: op.email
        });
        const removedLabel = `Removed "${pending.clientName}" from ${pending.chamberName}.`;
        pushOpMasterChange('remove', removedLabel);
        setOpMappingsSuccess(removedLabel);
        if (op.email) await loadOpMasterActivities(op.email);
      }
    } catch (err) {
      restorePendingMasterToUi(pending);
      setOpMappingsError(err.message || 'Delete failed. Item was restored.');
    }
  };

  const finalizePendingMasterDelete = async () => {
    const pending = pendingMasterDeleteRef.current;
    clearPendingMasterDeleteTimers();
    pendingMasterDeleteRef.current = null;
    setPendingMasterDelete(null);
    if (pending) await commitPendingMasterDelete(pending);
  };

  const handleUndoMasterDelete = () => {
    const pending = pendingMasterDeleteRef.current;
    clearPendingMasterDeleteTimers();
    pendingMasterDeleteRef.current = null;
    setPendingMasterDelete(null);
    if (!pending) return;
    restorePendingMasterToUi(pending);
    setOpMappingsSuccess(
      pending.kind === 'chamber' ? 'Chamber delete undone.' : 'Client remove undone.'
    );
  };

  const startPendingMasterDelete = async (pendingBase) => {
    if (pendingLogDeleteRef.current) await finalizePendingLogDelete();
    if (pendingOperatorDeleteRef.current) await finalizePendingOperatorDelete();
    if (pendingCustomerDeleteRef.current) await finalizePendingCustomerDelete();
    if (pendingMasterDeleteRef.current) await finalizePendingMasterDelete();

    const pending = { ...pendingBase, secondsLeft: 30 };
    pendingMasterDeleteRef.current = pending;
    setPendingMasterDelete(pending);

    pendingMasterDeleteTickRef.current = setInterval(() => {
      setPendingMasterDelete((prev) => {
        if (!prev) return null;
        const next = prev.secondsLeft - 1;
        if (next <= 0) return prev;
        return { ...prev, secondsLeft: next };
      });
    }, 1000);

    pendingMasterDeleteTimerRef.current = setTimeout(() => {
      finalizePendingMasterDelete();
    }, 30000);
  };

  const loadOpMasterActivities = async (email) => {
    const target = normalizeEmail(email);
    opMasterActivitiesEmailRef.current = target;
    if (!target) {
      setOpMasterActivities([]);
      setOpMasterActivitiesError('');
      setOpMasterActivitiesLoading(false);
      return;
    }
    setOpMasterActivities([]);
    setOpMasterActivitiesLoading(true);
    setOpMasterActivitiesError('');
    try {
      const data = await fetchOperatorActivities({
        page: 1,
        limit: 200,
        category: 'do_changes',
        operatorEmail: target
      });
      if (opMasterActivitiesEmailRef.current !== target) return;
      setOpMasterActivities(activitiesForOperatorEmail(Array.isArray(data?.items) ? data.items : [], target));
    } catch (err) {
      if (opMasterActivitiesEmailRef.current !== target) return;
      setOpMasterActivities([]);
      setOpMasterActivitiesError(err.message || 'Failed to load Master Setup activity.');
    } finally {
      if (opMasterActivitiesEmailRef.current === target) {
        setOpMasterActivitiesLoading(false);
      }
    }
  };

  const loadOpTaskStatus = async (op, fromDate, toDate) => {
    if (!op?.warehouse_name) {
      setOpTaskLogs([]);
      setOpTaskLogsError('');
      setOpIoByDate({});
      return;
    }
    const from = toApiDateParam(fromDate);
    const to = toApiDateParam(toDate);
    if (!from || !to) {
      setOpTaskLogsError('Select a valid date range.');
      return;
    }
    if (from > to) {
      setOpTaskLogsError("'From Date' must be on or before 'To Date'.");
      return;
    }
    setOpTaskLogsLoading(true);
    setOpTaskLogsError('');
    try {
      const ioPromise = op.email
        ? fetchDoOperatorIoCounts(op.email, { fromDate: from, toDate: to }).catch((err) => {
            console.warn('DO day-wise IO counts failed:', err.message || err);
            return null;
          })
        : Promise.resolve(null);

      let { items: rawItems = [] } = await fetchAllLogPages('/chamber-temp', {
        fromDate: from,
        toDate: to,
        warehouse: op.warehouse_name,
        operatorEmail: op.email,
        limit: 500,
        maxRows: 15000
      });
      if (rawItems.length === 0 && op.email) {
        ({ items: rawItems = [] } = await fetchAllLogPages('/chamber-temp', {
          fromDate: from,
          toDate: to,
          warehouse: op.warehouse_name,
          limit: 500,
          maxRows: 15000
        }));
      }
      const targetEmail = normalizeEmail(op.email);
      const emailMatched = rawItems.filter(
        (log) => targetEmail && normalizeEmail(log.operator_email) === targetEmail
      );
      setOpTaskLogs(emailMatched.length > 0 ? emailMatched : rawItems);

      const ioCounts = await ioPromise;
      if (ioCounts?.by_date && typeof ioCounts.by_date === 'object') {
        setOpIoByDate(ioCounts.by_date);
      } else {
        setOpIoByDate({});
      }
      if (ioCounts && op.email) {
        setViewingOperator((prev) => {
          if (!prev || normalizeEmail(prev.email) !== targetEmail) return prev;
          return {
            ...prev,
            total_inward: Number(ioCounts.total_inward) || 0,
            total_outward: Number(ioCounts.total_outward) || 0,
            today_inward: Number(ioCounts.today_inward) || 0,
            today_outward: Number(ioCounts.today_outward) || 0,
            io_counts_loading: false,
            io_counts_today: ioCounts.today || localDateStr()
          };
        });
      }
    } catch (err) {
      setOpTaskLogs([]);
      setOpIoByDate({});
      setOpTaskLogsError(err.message || 'Failed to load chamber task logs.');
    } finally {
      setOpTaskLogsLoading(false);
    }
  };

  const applyOpTaskDateRange = (op, fromDate, toDate) => {
    const from = toApiDateParam(fromDate);
    const to = toApiDateParam(toDate);
    if (!from || !to) {
      setOpTaskLogsError('Select a valid date range.');
      return;
    }
    if (from > to) {
      setOpTaskLogsError("'From Date' must be on or before 'To Date'.");
      return;
    }
    setOpTaskFromDate(from);
    setOpTaskToDate(to);
    setOpTaskAppliedFrom(from);
    setOpTaskAppliedTo(to);
    setOpTaskFilter('all');
    setOpTaskChamberFilter('all');
    loadOpTaskStatus(op, from, to);
    setOpTaskListPage(1);
    setOpTimelinePage(1);
  };

  const handleToggleOpMappings = async (op) => {
    if (expandedOpMappingsId === op.id) {
      setExpandedOpMappingsId(null);
      setOpMappings([]);
      setOpMappingsError('');
      setOpMappingsSuccess('');
    } else {
      setExpandedOpMappingsId(op.id);
      setNewClientInputs({});
      setNewChamberTypes({});
      await loadOpMappings(op.warehouse_name);
    }
  };

  const pushOpMasterChange = (kind, text) => {
    setOpMasterSessionChanges((prev) => [...prev, { kind, text }]);
  };

  const handleAddOpMapping = async (op, chamberId, chamberName, inputKey = chamberId) => {
    const clientName = (newClientInputs[inputKey] || newClientInputs[chamberId] || '').trim();
    if (!clientName) {
      setOpMappingsError('Please enter a client lot name.');
      return;
    }
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setAddingMappingChamberId(chamberId);
    try {
      const chambers = await fetchChambers().catch(() => []);
      const resolvedId = resolveChamberIdFromList(chambers, chamberId, chamberName);
      const chamberNum = chamberNumberFromName(chamberName);
      const existingType = (
        opMappings.find((row) =>
          Number(row?.chamber_id) === Number(resolvedId) ||
          chamberNumberFromName(row?.chamber_name) === chamberNum
        )?.chamber_type
      ) || (chamberNum != null ? opChamberTypeByNum[chamberNum] : null) || 'Frozen';
      await addChamberAssignment({
        chamber_id: resolvedId,
        client_name: clientName,
        remark: 'Added by Super Admin',
        chamber_type: existingType,
        warehouse_name: op.warehouse_name,
        operator_email: op.email
      });
      setNewClientInputs(prev => ({ ...prev, [inputKey]: '', [chamberId]: '' }));
      const addedLabel = `Added "${clientName}" to ${chamberName || `Chamber ${chamberId}`}.`;
      pushOpMasterChange('client', addedLabel);
      await refreshOperatorProfileMaster(op, addedLabel);
    } catch (err) {
      setOpMappingsError(err.message || 'Failed to add client mapping.');
    } finally {
      setAddingMappingChamberId(null);
    }
  };

  const handleUpdateOpChamberType = async (op, chamberId, chamberName, currentType, inputKey = chamberId) => {
    const nextType = String(newChamberTypes[inputKey] || newChamberTypes[chamberId] || currentType || 'Frozen').trim();
    if (!nextType) {
      setOpMappingsError('Please select a chamber type.');
      return;
    }
    if (String(currentType || '').trim() === nextType) {
      setOpMappingsError(`Chamber type is already ${nextType}.`);
      return;
    }
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setUpdatingChamberTypeKey(inputKey);
    try {
      const chambers = await fetchChambers().catch(() => []);
      const resolvedId = resolveChamberIdFromList(chambers, chamberId, chamberName);
      await updateChamber(resolvedId, {
        chamber_type: nextType,
        remark: `Updated by Super Admin for ${op.warehouse_name || 'operator'}`,
        warehouse_name: op.warehouse_name,
        operator_email: op.email
      });
      const typeLabel = `Updated ${chamberName} type ${currentType || 'Frozen'} → ${nextType}.`;
      pushOpMasterChange('type', typeLabel);
      await refreshOperatorProfileMaster(op, typeLabel);
    } catch (err) {
      setOpMappingsError(err.message || 'Failed to update chamber type.');
    } finally {
      setUpdatingChamberTypeKey(null);
    }
  };

  const handleDeleteOpMapping = async (op, chamberId, clientName, chamberName) => {
    if (
      !window.confirm(
        `Remove "${clientName}" from ${chamberName}?\n\nYou can Undo for 30 seconds.`
      )
    ) {
      return;
    }
    setOpMappingsError('');
    setOpMappingsSuccess('');

    const assignment =
      (opMappings || []).find(
        (m) =>
          String(m.client_name || '').trim().toLowerCase() ===
            String(clientName || '').trim().toLowerCase() &&
          (Number(m.chamber_id) === Number(chamberId) ||
            chamberNumberFromName(m.chamber_name) === chamberNumberFromName(chamberName))
      ) || {
        chamber_id: chamberId,
        client_name: clientName,
        chamber_name: chamberName,
        status: 'active'
      };

    setOpMappings((prev) =>
      (prev || []).filter(
        (m) =>
          !(
            String(m.client_name || '').trim().toLowerCase() ===
              String(clientName || '').trim().toLowerCase() &&
            (Number(m.chamber_id) === Number(chamberId) ||
              chamberNumberFromName(m.chamber_name) === chamberNumberFromName(chamberName))
          )
      )
    );

    await startPendingMasterDelete({
      kind: 'client',
      chamberId,
      clientName,
      chamberName,
      assignment: { ...assignment },
      op: {
        email: op.email,
        warehouse_name: op.warehouse_name,
        full_name: op.full_name
      },
      label: clientName
    });
  };

  const handleAddOpChamber = async (op) => {
    if (!op?.warehouse_name) {
      setOpMappingsError('Configure warehouse access before adding a chamber.');
      return;
    }
    const usedNums = (opChambersList || [])
      .map((c) => chamberNumberFromName(c.name || c.chamber_name))
      .filter((n) => n != null);
    const nextNum = Math.max(Number(op.chamber_limit) || 4, ...usedNums, 0) + 1;
    const name = String(opNewChamberName || '').trim() || `Chamber ${nextNum}`;
    const chamberType = String(opNewChamberType || 'Frozen').trim() || 'Frozen';
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setAddingOpChamber(true);
    try {
      const res = await createChamber({
        name,
        chamber_type: chamberType,
        remark: `Added by Super Admin for ${op.full_name || op.email}`,
        warehouse_name: op.warehouse_name,
        operator_email: op.email
      });
      const created = res?.data || {};
      const newLimit = res?.chamber_limit != null ? Number(res.chamber_limit) : null;
      if (newLimit && Number.isFinite(newLimit)) {
        setViewingOperator((prev) =>
          prev && Number(prev.id) === Number(op.id) ? { ...prev, chamber_limit: newLimit } : prev
        );
        setOperators((prev) =>
          (prev || []).map((row) =>
            Number(row.id) === Number(op.id) ? { ...row, chamber_limit: newLimit } : row
          )
        );
      }
      setOpNewChamberName('');
      setOpNewChamberType('Frozen');
      const addedLabel = `Added chamber "${created.name || name}"${
        newLimit ? ` · limit ${newLimit}` : ''
      }.`;
      pushOpMasterChange('chamber', addedLabel);
      await refreshOperatorProfileMaster(op, addedLabel);
      if (op.email) await loadOpMasterActivities(op.email);
    } catch (err) {
      setOpMappingsError(err.message || 'Failed to add chamber.');
    } finally {
      setAddingOpChamber(false);
    }
  };

  const handleDeleteOpChamber = async (op, chamberId, chamberName) => {
    if (!chamberId) {
      setOpMappingsError('Cannot delete this chamber because its id is missing.');
      return;
    }
    const label = chamberName || `Chamber ${chamberId}`;
    if (
      !window.confirm(
        `Delete ${label}?\n\nThis removes the chamber from master and its client mappings. Temperature logs are kept in history.\n\nYou can Undo for 30 seconds.`
      )
    ) {
      return;
    }
    setOpMappingsError('');
    setOpMappingsSuccess('');

    const chamberRecord =
      (opChambersList || []).find((c) => Number(c.id) === Number(chamberId)) || {
        id: chamberId,
        name: chamberName,
        chamber_name: chamberName
      };
    const relatedMappings = (opMappings || []).filter((m) =>
      mappingBelongsToPendingChamber(m, { chamberId, chamberName })
    );

    setOpChambersList((prev) => (prev || []).filter((c) => Number(c.id) !== Number(chamberId)));
    setOpMappings((prev) =>
      (prev || []).filter((m) => !mappingBelongsToPendingChamber(m, { chamberId, chamberName }))
    );

    await startPendingMasterDelete({
      kind: 'chamber',
      chamberId,
      chamberName: label,
      chamberRecord: { ...chamberRecord },
      mappings: relatedMappings.map((m) => ({ ...m })),
      op: {
        email: op.email,
        warehouse_name: op.warehouse_name,
        full_name: op.full_name
      },
      label
    });
  };

  const loadActivities = async () => {
    if (auditSubTab === 'permission_log') return;

    const category =
      auditSubTab === 'security_log' ? 'security' :
      auditSubTab === 'system_errors' ? 'system' :
      auditSubTab === 'do_changes' ? 'do_changes' :
      'activity';

    const page =
      category === 'security' ? securityCurrentPage :
      category === 'system' ? systemCurrentPage :
      activitiesCurrentPage;

    const limit =
      category === 'security' ? securityPerPage :
      category === 'system' ? systemPerPage :
      activitiesPerPage;

    const search =
      category === 'security' ? securitySearch :
      category === 'system' ? systemSearch :
      activitiesSearch;

    const fromDate =
      category === 'security' ? securityFromDate :
      category === 'system' ? systemFromDate :
      activitiesFromDate;

    const toDate =
      category === 'security' ? securityToDate :
      category === 'system' ? systemToDate :
      activitiesToDate;

    const action =
      category === 'security' ? securityActionFilter :
      category === 'system' ? systemActionFilter :
      activitiesActionFilter;

    setLoadingActivities(true);
    setLogsError('');
    try {
      const data = await fetchOperatorActivities({
        paginated: true,
        page,
        limit,
        category,
        search: (search || '').trim() || undefined,
        fromDate: toApiDateParam(fromDate) || undefined,
        toDate: toApiDateParam(toDate) || undefined,
        action: action !== 'All' ? action : undefined,
        warehouse: category === 'activity' && selectedWarehouseFilter !== 'All'
          ? selectedWarehouseFilter
          : undefined
      });
      setActivities(Array.isArray(data?.items) ? data.items : []);
      setActivitiesTotal(Number(data?.total) || 0);
      if (category === 'do_changes') {
        const nowStr = new Date().toISOString();
        localStorage.setItem('last_checked_do_changes', nowStr);
        setLastCheckedDOChanges(nowStr);
        setHasNewDOChanges(false);
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
      setLogsError(err.message || 'Failed to fetch activity logs.');
      setActivities([]);
      setActivitiesTotal(0);
    } finally {
      setLoadingActivities(false);
    }
  };

  // Permission Requests State & Handlers
  const [permissionRequests, setPermissionRequests] = useState([]);
  const [loadingPermRequests, setLoadingPermRequests] = useState(false);

  const loadPermissionRequests = async (silent = false) => {
    if (!silent) {
      setLoadingPermRequests(true);
      setLogsError('');
    }
    try {
      const data = await fetchPermissionRequests();
      const list = Array.isArray(data) ? data : [];
      const seen = new Set();
      const byPendingFp = new Map();
      const merged = [];
      for (const pr of list) {
        if (!pr || pr.id == null || seen.has(pr.id)) continue;
        seen.add(pr.id);
        if (pr.status === 'Pending') {
          const fp = buildPendingPermissionFingerprint(pr);
          const cur = byPendingFp.get(fp);
          if (!cur || Number(pr.id) > Number(cur.id)) {
            byPendingFp.set(fp, pr);
          }
        } else {
          merged.push(pr);
        }
      }
      setPermissionRequests(
        [...byPendingFp.values(), ...merged].sort((a, b) => Number(b.id) - Number(a.id))
      );
    } catch (err) {
      console.error('Failed to fetch permission requests:', err);
      if (!silent) {
        setLogsError(err.message || 'Failed to fetch permission requests.');
      }
    } finally {
      if (!silent) {
        setLoadingPermRequests(false);
      }
    }
  };

  useEffect(() => {
    loadPermissionRequests(true);
    const interval = setInterval(() => {
      loadPermissionRequests(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const openDenyPermissionModal = (pr) => {
    if (!pr?.id) return;
    const parsed = parseRequestDescription(pr.description || pr.request_description, pr.record_type);
    setDenyPermissionModal({
      open: true,
      id: pr.id,
      remark: '',
      busy: false,
      operatorLabel: pr.operator_email || 'DO',
      summary: [parsed.module, parsed.client !== '-' ? parsed.client : null]
        .filter(Boolean)
        .join(' · ')
    });
  };

  const closeDenyPermissionModal = () => {
    setDenyPermissionModal({
      open: false,
      id: null,
      remark: '',
      busy: false,
      operatorLabel: '',
      summary: ''
    });
  };

  const handleApproveDenyPermission = async (id, status, remark = '') => {
    setLogsError('');
    const note = String(remark || '').trim();
    if (status === 'Denied' && !note) {
      setLogsError('A remark is required when denying a permission request.');
      return;
    }
    try {
      const res = await updatePermissionRequest(id, status, note);
      loadPermissionRequests();
      loadActivities();
      // Chamber Add approve bumps chamber_limit — refresh Operators Directory
      if (status === 'Approved') {
        loadOperatorsData();
      }
      if (res?.chamber_add?.ok) {
        setOpSuccess(
          `Chamber "${res.chamber_add.name}" added. Operator limit → ${res.chamber_add.chamber_limit}.`
        );
      } else if (res?.client_master?.ok) {
        const cm = res.client_master;
        const actionLabel =
          cm.action === 'add' ? 'added' : cm.action === 'delete' ? 'removed' : 'updated';
        setOpSuccess(
          `Client "${cm.client_name}" ${actionLabel} on ${cm.chamber_name || 'chamber'}. Operator app will sync automatically.`
        );
      } else if (res?.chamber_type?.ok) {
        setOpSuccess(
          `Chamber type of "${res.chamber_type.name}" updated to ${res.chamber_type.chamber_type}.`
        );
      } else if (status === 'Denied') {
        setOpSuccess('Request denied. Your remark was sent to the DO.');
      }
    } catch (err) {
      console.error('Failed to update permission request:', err);
      setLogsError(err.message || 'Failed to update permission request.');
      throw err;
    }
  };

  const confirmDenyPermission = async () => {
    const id = denyPermissionModal.id;
    const remark = String(denyPermissionModal.remark || '').trim();
    if (!id) return;
    if (!remark) {
      setLogsError('Please enter a remark so the DO knows why this was denied.');
      return;
    }
    setDenyPermissionModal((prev) => ({ ...prev, busy: true }));
    try {
      await handleApproveDenyPermission(id, 'Denied', remark);
      closeDenyPermissionModal();
    } catch (_) {
      setDenyPermissionModal((prev) => ({ ...prev, busy: false }));
    }
  };

  const [systemConfig, setSystemConfig] = useState({
      Chamber_Edit: 'Require Approval',
    Chamber_Delete: 'Require Approval',
    ChamberMaster_Edit: 'Require Approval',
    ChamberMaster_Delete: 'Require Approval',
    ClientMaster_Edit: 'Require Approval',
    ClientMaster_Delete: 'Require Approval',
    Inward_Edit: 'Require Approval',
    Inward_Delete: 'Require Approval',
    Outward_Edit: 'Require Approval',
    Outward_Delete: 'Require Approval',
  });
  const [loadingConfig, setLoadingConfig] = useState(false);

  const loadSystemConfig = async () => {
    setLoadingConfig(true);
    setLogsError('');
    try {
      const data = await fetchSystemConfig();
      setSystemConfig(data);
    } catch (err) {
      console.error('Failed to load system config:', err);
      setLogsError(err.message || 'Failed to load system config.');
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleToggleConfig = async (configKey, currentVal) => {
    const newVal = currentVal === 'Allow' ? 'Require Approval' : 'Allow';
    setLogsError('');
    try {
      await updateSystemConfig(configKey, newVal);
      setSystemConfig(prev => ({
        ...prev,
        [configKey]: newVal
      }));
      loadActivities();
    } catch (err) {
      console.error('Failed to update configuration setting:', err);
      setLogsError(err.message || 'Failed to update configuration setting.');
    }
  };

  const parseRequestDescription = (descText, recordType = '') => {
    const info = {
      module: '-',
      client: '-',
      refNo: '',
      extra: '-'
    };
    if (!descText && !recordType) return info;
    
    const parts = (descText || '').split(' | ');
    
    if (recordType === 'MasterSetup' || (descText || '').includes('Master Setup') || (descText || '').includes('chambers & clients')) {
      info.module = 'Master Setup';
      info.client = 'Chambers & Clients';
      info.refNo = 'OPEN';
      info.extra = descText || 'Master Setup opens without Super Admin approval.';
      return info;
    } else if (
      recordType === 'ChamberType' ||
      /EDIT chamber type/i.test(descText || '')
    ) {
      info.module = 'Chamber Type';
      const nameMatch = (descText || '').match(/EDIT chamber type "([^"]+)"/i);
      const fromTo = (descText || '').match(/from\s+([A-Za-z]+)\s+to\s+([A-Za-z]+)/i);
      info.client = nameMatch ? nameMatch[1] : 'Chamber';
      info.refNo = 'TYPE';
      info.extra = fromTo
        ? `${fromTo[1]} → ${fromTo[2]}`
        : (descText || 'Data Operator requested Super Admin approval to change chamber type.');
      return info;
    } else if (
      recordType === 'ChamberMaster' ||
      (descText || '').includes('delete chamber') ||
      (descText || '').includes('ADD chamber')
    ) {
      if (/ADD chamber/i.test(descText || '')) info.module = 'Chamber Add';
      else info.module = 'Chamber Delete';
      const nameMatch =
        (descText || '').match(/ADD chamber "([^"]+)"/i) ||
        (descText || '').match(/delete chamber "([^"]+)"/i);
      info.client = nameMatch ? nameMatch[1] : 'Chamber';
      info.refNo = info.module === 'Chamber Add' ? 'ADD' : 'DELETE';
      info.extra = descText || 'Data Operator requested Super Admin approval for chamber master.';
      return info;
    } else if (
      recordType === 'ClientMaster' ||
      (descText || '').includes('client master') ||
      (descText || '').includes('EDIT client') ||
      (descText || '').includes('DELETE client') ||
      (descText || '').includes('edited client')
    ) {
      const isDelete = /DELETE client/i.test(descText || '');
      const isRename = /EDIT client/i.test(descText || '');
      info.module = isDelete ? 'Client Delete' : isRename ? 'Client Rename' : 'Client Add';
      const clientMatch =
        (descText || '').match(/EDIT client "([^"]+)"/i) ||
        (descText || '').match(/DELETE client "([^"]+)"/i) ||
        (descText || '').match(/client master "([^"]+)"/i) ||
        (descText || '').match(/client "([^"]+)"/i);
      const chamberMatch = (descText || '').match(/on chamber "([^"]+)"/i);
      const renameTo = (descText || '').match(/EDIT client "[^"]+"\s*(?:→|->)\s*"([^"]+)"/i);
      info.client = renameTo
        ? `${clientMatch ? clientMatch[1] : 'Client'} → ${renameTo[1]}`
        : (clientMatch ? clientMatch[1] : 'Client');
      info.refNo = isDelete ? 'DELETE' : isRename ? 'RENAME' : 'ADD';
      info.extra = chamberMatch
        ? `${info.client} on ${chamberMatch[1]}`
        : (descText || 'Data Operator requested Super Admin approval for client master change.');
      return info;
    } else if ((descText || '').includes('Chamber')) {
      info.module = 'Chamber Temp';
    } else if ((descText || '').includes('Inward')) {
      info.module = 'Inward DO Log';
    } else if ((descText || '').includes('Outward')) {
      info.module = 'Outward DO Log';
    }
    
    // Match Ref: RF-XX-26-XXXX or ID: XX
    const refMatch = (descText || '').match(/\((?:Ref|ID):\s*([^\)]+)\)/i);
    if (refMatch) {
      info.refNo = refMatch[1].trim();
    }
    
    const clientPart = parts.find(p => p.startsWith('Client:'));
    if (clientPart) {
      info.client = clientPart.replace('Client:', '').trim();
    }
    
    const extras = parts.filter(p => !p.startsWith('Client:') && !p.includes('Requested permission'));
    if (extras.length > 0) {
      info.extra = extras.join(' | ');
    }
    
    return info;
  };

  const loadRecordAllowHistory = async (type, log) => {
    if (!log) {
      setRecordAllowHistory([]);
      return;
    }
    const recordType =
      type === 'daily' || type === 'Chamber' ? 'Chamber' :
      type === 'inward' || type === 'Inward' ? 'Inward' :
      type === 'outward' || type === 'Outward' ? 'Outward' :
      type || 'Chamber';
    const recordId =
      recordType === 'Inward'
        ? (log.inward_id || log.id)
        : recordType === 'Outward'
          ? (log.outward_id || log.id)
          : (log.id || log.chamber_id);
    if (!recordId) {
      setRecordAllowHistory([]);
      return;
    }
    setLoadingAllowHistory(true);
    try {
      const data = await fetchRecordPermissionHistory(recordType, recordId);
      setRecordAllowHistory(Array.isArray(data?.items) ? data.items : []);
    } catch (_) {
      setRecordAllowHistory([]);
    } finally {
      setLoadingAllowHistory(false);
    }
  };

  const formatAllowDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (_) {
      return String(value);
    }
  };

  /** Structured Super Allow / update trail for History Log + Profile Lookup */
  const renderSuperAllowSection = (logForCompare = null) => {
    const latestCompareRows = parseUpdateDetails(logForCompare?.update_details);
    const hasTrail = recordAllowHistory.length > 0;
    const hasCompare = latestCompareRows.length > 0;

    return (
    <div
      className="profile-group-card"
      style={{
        marginTop: 12,
        border: '1px solid #bfdbfe',
        background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 48%)'
      }}
    >
      <div className="profile-group-title" style={{ color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={16} color="#1d4ed8" />
        Approval & Update Comparison
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: '0.74rem', color: '#64748b' }}>
        After Super Admin approval — compare previous and updated values, remarks, and decision date
      </p>

      {hasCompare ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid #86efac', background: '#f0fdf4' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#15803d', marginBottom: 4 }}>
            Latest field changes after approval / update
            {Number(logForCompare?.update_count) > 0 ? ` · Edit #${logForCompare.update_count}` : ''}
          </div>
          {renderFieldCompareTable(latestCompareRows, { title: 'Compare: Before → After' })}
          {(() => {
            const lastUpd = formatUpdatedAtStr(
              logForCompare?.created_at || logForCompare?.inward_created_at || logForCompare?.outward_created_at,
              logForCompare?.updated_at || logForCompare?.inward_updated_at || logForCompare?.outward_updated_at
            );
            return (
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                Last updated: {lastUpd}
              </div>
            );
          })()}
        </div>
      ) : null}

      {loadingAllowHistory ? (
        <SaDataLoading label="Loading approval history…" compact />
      ) : !hasTrail ? (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem' }}>
          {hasCompare
            ? 'Field comparison is available above. No separate approval request history for this record yet.'
            : 'No Super Admin approval or update history is stored for this record yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recordAllowHistory.map((ev) => {
            const decision = String(ev.decision || '');
            const badgeBg =
              decision === 'Approved' ? '#dcfce7' :
              decision === 'Denied' ? '#fee2e2' :
              decision === 'Pending' ? '#fef9c3' :
              decision === 'Used' || decision === 'UPDATE' ? '#e0e7ff' :
              '#e2e8f0';
            const badgeFg =
              decision === 'Approved' ? '#15803d' :
              decision === 'Denied' ? '#b91c1c' :
              decision === 'Pending' ? '#a16207' :
              decision === 'Used' || decision === 'UPDATE' ? '#3730a3' :
              '#475569';
            const changeRows = Array.isArray(ev.change_rows) && ev.change_rows.length
              ? ev.change_rows
              : parseUpdateDetails(ev.changes || '');
            return (
              <div
                key={ev.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: '#fff'
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    background: badgeBg,
                    color: badgeFg
                  }}>
                    {ev.event_label || ev.action}
                  </span>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    background: '#f1f5f9',
                    color: '#475569'
                  }}>
                    {ev.request_type || '—'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>
                    {formatAllowDate(ev.date)}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: '0.78rem' }}>
                  <div>
                    <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Decision</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{ev.decision || ev.action || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Operator</div>
                    <div style={{ fontWeight: 600, color: '#334155' }}>{renderOperatorEmail(ev.operator_email)}</div>
                  </div>
                  {ev.decided_by || ev.decided_by_email || ev.decided_by_name ? (
                    <div>
                      <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Decided By</div>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{renderDecidedByCell(ev)}</div>
                    </div>
                  ) : null}
                </div>

                {changeRows.length > 0
                  ? renderFieldCompareTable(changeRows, { title: 'Changed fields after approval' })
                  : (ev.changes ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>What updated</div>
                      <div style={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 600 }}>{ev.changes}</div>
                    </div>
                  ) : null)}

                {(ev.remark || ev.sa_remark) ? (
                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    {ev.remark ? (
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>Remark</div>
                        <div style={{ fontSize: '0.8rem', color: '#065f46', fontWeight: 600 }}>{ev.remark}</div>
                      </div>
                    ) : null}
                    {ev.sa_remark ? (
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Super Admin Remark</div>
                        <div style={{ fontSize: '0.8rem', color: '#1e3a8a', fontWeight: 600 }}>{ev.sa_remark}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {ev.description && !changeRows.length ? (
                  <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.45 }}>
                    {ev.description}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
    );
  };

  const showLogDetailsByRef = async (refNo, fallbackId, moduleType) => {
    if (!refNo && !fallbackId) return;
    
    let foundLog = null;
    let type = '';
    
    // 1. Try matching reference number first (in-memory page cache)
    if (refNo) {
      const chamberLog = (chamberLogs || []).find(l => l && l.reference_no === refNo);
      if (chamberLog) {
        foundLog = chamberLog;
        type = 'daily';
      } else {
        const inwardLog = (inwardLogs || []).find(l => l && l.reference_no === refNo);
        if (inwardLog) {
          foundLog = inwardLog;
          type = 'inward';
        } else {
          const outwardLog = (outwardLogs || []).find(l => l && l.reference_no === refNo);
          if (outwardLog) {
            foundLog = outwardLog;
            type = 'outward';
          }
        }
      }
    }
    
    // 2. Try matching fallback ID (in-memory)
    if (!foundLog && fallbackId) {
      if (moduleType === 'Chamber Temp' || moduleType === 'Chamber Temp Log' || moduleType === 'Chamber') {
        foundLog = (chamberLogs || []).find(l => l && l.id == fallbackId);
        type = 'daily';
      } else if (moduleType === 'Inward DO Log' || moduleType === 'Inward DO' || moduleType === 'Inward' || moduleType === 'Inward Log') {
        foundLog = (inwardLogs || []).find(l => l && l.inward_id == fallbackId);
        type = 'inward';
      } else if (moduleType === 'Outward DO Log' || moduleType === 'Outward DO' || moduleType === 'Outward' || moduleType === 'Outward Log') {
        foundLog = (outwardLogs || []).find(l => l && l.outward_id == fallbackId);
        type = 'outward';
      }
    }

    // 3. Server lookup when not in current page cache
    if (!foundLog && refNo) {
      try {
        const searchOpts = { paginated: true, search: refNo, page: 1, limit: 20 };
        const [c, i, o] = await Promise.all([
          fetchChamberLogs('', searchOpts),
          fetchInwardLogs('', searchOpts),
          fetchOutwardLogs('', searchOpts)
        ]);
        foundLog =
          (c.items || []).find(l => l.reference_no === refNo) ||
          (i.items || []).find(l => l.reference_no === refNo) ||
          (o.items || []).find(l => l.reference_no === refNo);
        if (foundLog) {
          if ((c.items || []).some(l => l.reference_no === refNo)) type = 'daily';
          else if ((i.items || []).some(l => l.reference_no === refNo)) type = 'inward';
          else type = 'outward';
        }
      } catch (err) {
        console.error('Failed to resolve log by ref:', err);
      }
    }
    
    if (foundLog) {
      setSelectedDetailLog(foundLog);
      setDetailType(type);
      loadRecordAllowHistory(type, foundLog);
    } else {
      setRecordAllowHistory([]);
      alert(`Record details not loaded in system view yet. Reference: ${refNo || ('ID #' + fallbackId)}. Please view it inside History Logs tab or Profile Lookup.`);
    }
  };

  const renderOperatorEmail = (email) => {
    if (!email) return '-';
    const emailLower = email.toLowerCase().trim();
    const matchedOp = (operators || []).find(
      (op) => op && op.email && op.email.toLowerCase().trim() === emailLower
    );
    const doName = matchedOp?.full_name ? String(matchedOp.full_name).trim() : '';

    if (emailLower === 'system' || (emailLower.includes('admin') && !matchedOp)) {
      return email;
    }

    const isActive = Boolean(matchedOp);
    const identity = doName ? (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
        <span style={{ fontWeight: 800, color: '#0f172a' }}>{doName}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>{email}</span>
      </span>
    ) : (
      <span>{email}</span>
    );

    if (!isActive) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4.5px' }}>
          {identity}
          <span style={{ 
            fontSize: '0.62rem', 
            fontWeight: '800', 
            color: '#ef4444', 
            backgroundColor: '#fee2e2', 
            padding: '1px 5px', 
            borderRadius: '4px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap'
          }}>
            Past DO
          </span>
        </span>
      );
    }
    return identity;
  };

  const formatDuration = (hoursStr, minsStr) => {
    const hours = parseInt(hoursStr) || 0;
    const mins = parseInt(minsStr) || 0;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d ${remHours}h ${mins}m`;
    }
    return `${hours}h ${mins}m`;
  };

  const getUpdateDiff = (created, updated) => {
    if (!created || !updated) return false;
    const cTime = Math.floor(new Date(created).getTime() / 1000);
    const uTime = Math.floor(new Date(updated).getTime() / 1000);
    return uTime > cTime;
  };

  const operatorWarehouseMap = {};
  (operators || []).forEach(op => {
    if (op && op.email && op.warehouse_name) {
      operatorWarehouseMap[op.email.toLowerCase()] = op.warehouse_name;
    }
  });
  const warehousesList = Array.from(new Set((operators || []).map(op => op && op.warehouse_name).filter(Boolean)));

  const dashboardPendingRequests = useMemo(
    () => filterActionablePendingPermissionRequests(permissionRequests, operatorWarehouseMap, 'All'),
    [permissionRequests, operators]
  );

  const doTaskSummary = doTaskOverview?.summary || {};
  const doTaskRows = useMemo(() => {
    const rows = Array.isArray(doTaskOverview?.operators) ? [...doTaskOverview.operators] : [];
    const q = String(doTaskSearch || '').trim().toLowerCase();
    const filtered = rows.filter((op) => {
      const pending = Number(op.pending) || 0;
      const overdue = Number(op.overdue) || 0;
      const completed = Number(op.completed) || 0;
      const expected = Number(op.expected_today) || completed + pending;
      if (doTaskFilter === 'pending' && pending === 0) return false;
      if (doTaskFilter === 'overdue' && overdue === 0) return false;
      if (doTaskFilter === 'done' && !(pending === 0 && expected > 0 && overdue === 0)) return false;
      if (!q) return true;
      const hay = `${op.name || ''} ${op.full_name || ''} ${op.email || ''} ${op.warehouse_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
    filtered.sort((a, b) => {
      const ao = Number(a.overdue) || 0;
      const bo = Number(b.overdue) || 0;
      if (ao !== bo) return bo - ao;
      const ap = Number(a.pending) || 0;
      const bp = Number(b.pending) || 0;
      if (ap !== bp) return bp - ap;
      return String(a.name || a.full_name || '').localeCompare(String(b.name || b.full_name || ''));
    });
    return filtered;
  }, [doTaskOverview, doTaskFilter, doTaskSearch]);

  const loadDashboardStatsData = async () => {
    try {
      const stats = await fetchDashboardStats();
      if (stats) {
        setDashboardStats(stats);
      }
      checkNewDOChanges();
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    }
  };

  const loadDoTaskOverview = async (rangeOverride) => {
    setLoadingDoTasks(true);
    setDoTaskError('');
    try {
      let from =
        toApiDateParam(
          rangeOverride?.fromDate !== undefined ? rangeOverride.fromDate : doTaskFromDate
        ) || localDateStr();
      let to =
        toApiDateParam(
          rangeOverride?.toDate !== undefined ? rangeOverride.toDate : doTaskToDate
        ) || from;
      // Back-compat: single date string/arg still works
      if (typeof rangeOverride === 'string') {
        from = toApiDateParam(rangeOverride) || localDateStr();
        to = from;
      }
      if (from > to) {
        const tmp = from;
        from = to;
        to = tmp;
      }
      setDoTaskFromDate(from);
      setDoTaskToDate(to);
      const data = await fetchDoTaskOverview({ fromDate: from, toDate: to });
      const respFrom = toApiDateParam(data?.fromDate) || from;
      const respTo = toApiDateParam(data?.toDate) || to;
      if (respFrom !== from || respTo !== to) {
        setDoTaskError(
          `Server returned ${respFrom} → ${respTo} instead of ${from} → ${to}. Restart backend to enable date range.`
        );
      }
      const nextOperators = Array.isArray(data?.operators)
        ? data.operators.map((op) => ({
            ...op,
            total_inward: Number(op.total_inward) || 0,
            total_outward: Number(op.total_outward) || 0,
            today_inward: Number(op.today_inward) || 0,
            today_outward: Number(op.today_outward) || 0
          }))
        : [];
      const summary = {
        ...(data?.summary || {}),
        total_inward: Number(data?.summary?.total_inward) || 0,
        total_outward: Number(data?.summary?.total_outward) || 0,
        today_inward: Number(data?.summary?.today_inward) || 0,
        today_outward: Number(data?.summary?.today_outward) || 0,
        range_inward: Number(data?.summary?.range_inward ?? data?.summary?.today_inward) || 0,
        range_outward: Number(data?.summary?.range_outward ?? data?.summary?.today_outward) || 0
      };
      setDoTaskOverview(data ? { ...data, summary, operators: nextOperators } : null);
      if (respFrom) setDoTaskFromDate(respFrom);
      if (respTo) setDoTaskToDate(respTo);
    } catch (err) {
      console.error('Error loading DO daily tasks:', err);
      setDoTaskError(err.message || 'Failed to load DO daily tasks.');
    } finally {
      setLoadingDoTasks(false);
    }
  };

  const checkNewDOChanges = async () => {
    try {
      const data = await fetchOperatorActivities({
        paginated: true,
        page: 1,
        limit: 1,
        category: 'do_changes'
      });
      const latestLog = data?.items && data.items.length > 0 ? data.items[0] : null;
      if (latestLog && latestLog.created_at) {
        const logTime = new Date(latestLog.created_at).getTime();
        const lastCheckTime = new Date(localStorage.getItem('last_checked_do_changes') || '1970-01-01T00:00:00.000Z').getTime();
        if (logTime > lastCheckTime) {
          setHasNewDOChanges(true);
        } else {
          setHasNewDOChanges(false);
        }
      } else {
        setHasNewDOChanges(false);
      }
    } catch (err) {
      console.warn('Failed to check for new DO changes:', err);
    }
  };

  useEffect(() => {
    checkNewDOChanges();
    const interval = setInterval(() => {
      checkNewDOChanges();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadHistoryLogs = async () => {
    setLoadingLogs(true);

    const opts = {
      paginated: true,
      page: historyPage,
      limit: historyPerPage,
      search: appliedLogsSearch,
      fromDate: toApiDateParam(appliedFromDate),
      toDate: toApiDateParam(appliedToDate),
      warehouse: selectedWarehouse !== 'All' ? selectedWarehouse : undefined,
      shift: historyTab === 'daily' && historyShiftFilter !== 'All' ? historyShiftFilter : undefined
    };

    try {
      if (historyTab === 'daily') {
        const data = await fetchChamberLogs('', opts);
        setChamberLogs(Array.isArray(data?.items) ? data.items : []);
        setHistoryTotal(data?.total ?? 0);
      } else if (historyTab === 'inward') {
        const data = await fetchInwardLogs('', opts);
        setInwardLogs(Array.isArray(data?.items) ? data.items : []);
        setHistoryTotal(data?.total ?? 0);
      } else {
        const data = await fetchOutwardLogs('', opts);
        setOutwardLogs(Array.isArray(data?.items) ? data.items : []);
        setHistoryTotal(data?.total ?? 0);
      }
    } catch (err) {
      console.error('Error loading history logs:', err);
      if (historyTab === 'daily') setChamberLogs([]);
      else if (historyTab === 'inward') setInwardLogs([]);
      else setOutwardLogs([]);
      setHistoryTotal(0);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Menu-driven data loading — fetch the datasets each sidebar section needs
  useEffect(() => {
    if (activeMenu === 'dashboard') {
      loadOperatorsData();
      loadDashboardStatsData();
      loadDoTaskOverview();
      loadSubAdminsData();
      loadCustomerReportsData();
      loadPermissionRequests(true);
      checkNewDOChanges();
    } else if (activeMenu === 'customers') {
      loadSubAdminsData();
      loadAccessScopeOptions();
    } else if (activeMenu === 'master_data') {
      loadAccessScopeOptions();
    } else if (activeMenu === 'customer_reports') {
      loadCustomerReportsData();
      loadSubAdminsData();
      loadNoteThreads();
      loadNoteMessages('All');
    } else if (activeMenu === 'data_operators') {
      loadAccessScopeOptions();
      loadOperatorsData();
    } else if (activeMenu === 'activity_logs') {
      loadOperatorsData();
      loadPermissionRequests();
      loadSystemConfig();
    } else if (activeMenu === 'history_logs' || activeMenu === 'profile_lookup') {
      loadOperatorsData();
    } else if (activeMenu === 'inventory_log') {
      loadOperatorsData();
      loadInventoryReconciliationData();
    } else if (activeMenu === 'daily_box_tracker') {
      loadDailyBoxTrackerData();
    }
  }, [activeMenu]);

  useEffect(() => {
    if (activeMenu !== 'inventory_log') return;
    const timer = setTimeout(() => {
      loadInventoryReconciliationData();
    }, 280);
    return () => clearTimeout(timer);
  }, [activeMenu, inventorySearch, inventoryWarehouseFilter]);

  useEffect(() => {
    if (activeMenu !== 'history_logs') return;
    loadHistoryLogs();
  }, [activeMenu, historyTab, historyPage, appliedFromDate, appliedToDate, appliedLogsSearch, selectedWarehouse, historyShiftFilter]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyTab]);

  useEffect(() => {
    if (activeMenu !== 'activity_logs') return;
    if (auditSubTab === 'permission_log') return;
    const timer = setTimeout(() => {
      loadActivities();
    }, 280);
    return () => clearTimeout(timer);
  }, [
    activeMenu,
    auditSubTab,
    activitiesCurrentPage,
    securityCurrentPage,
    systemCurrentPage,
    activitiesSearch,
    activitiesFromDate,
    activitiesToDate,
    activitiesActionFilter,
    securitySearch,
    securityFromDate,
    securityToDate,
    securityActionFilter,
    systemSearch,
    systemFromDate,
    systemToDate,
    systemActionFilter,
    selectedWarehouseFilter
  ]);

  useEffect(() => {
    setActivitiesCurrentPage(1);
    setSecurityCurrentPage(1);
    setSystemCurrentPage(1);
    setActivities([]);
    setActivitiesTotal(0);
  }, [auditSubTab]);

  const handleLookupSearch = async () => {
    const q = lookupQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchedRecord(null);
      return;
    }

    setLoadingLogs(true);
    try {
      const searchOpts = { paginated: true, search: q, page: 1, limit: 100 };
      const [chamberRes, inwardRes, outwardRes] = await Promise.all([
        fetchChamberLogs('', searchOpts),
        fetchInwardLogs('', searchOpts),
        fetchOutwardLogs('', searchOpts)
      ]);

      const results = [];

      (chamberRes.items || []).forEach((log) => {
        results.push({
          type: 'daily',
          label: 'Daily Chamber Log',
          reference_no: log.reference_no,
          date: log.formatted_date || (log.entry_date ? String(log.entry_date).split('T')[0] : ''),
          facility: log.warehouse_name || 'Generic',
          client: log.client_name,
          details: `Chamber: ${log.chamber_name} | Temp: ${log.chamber_temp}°C`,
          original: log
        });
      });

      (inwardRes.items || []).forEach((log) => {
        results.push({
          type: 'inward',
          label: 'Inward Log',
          reference_no: log.reference_no,
          date: log.inward_entry_date ? String(log.inward_entry_date).split('T')[0] : '',
          facility: log.warehouse_name || 'Generic',
          client: log.inward_client_name,
          details: `Vehicle: ${log.inward_vehicle_no} | Temp: ${log.inward_vehicle_temp}°C | Pallets: ${log.inward_pallets_in_qty}`,
          original: log
        });
      });

      (outwardRes.items || []).forEach((log) => {
        results.push({
          type: 'outward',
          label: 'Outward Log',
          reference_no: log.reference_no,
          date: log.outward_entry_date ? String(log.outward_entry_date).split('T')[0] : '',
          facility: log.warehouse_name || 'Generic',
          client: log.outward_client_name,
          details: `Vehicle: ${log.outward_vehicle_no} | Temp: ${log.outward_vehicle_temp}°C | Pallets: ${log.outward_pallets_qty || log.outward_pallets_in_qty || 0}`,
          original: log
        });
      });

      setSearchResults(results);

      if (results.length === 1) {
        setSearchedRecord(results[0].original);
        setSearchedRecordType(results[0].type);
        loadRecordAllowHistory(results[0].type, results[0].original);
      } else {
        setSearchedRecord(null);
        setRecordAllowHistory([]);
      }
    } catch (err) {
      console.error('Lookup failed:', err);
      alert(err.message || 'Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const setExportFailure = (err, retryKey) => {
    const message = getExportErrorMessage(err);
    if (!message) return;
    setExportError({
      message,
      retryable: isRetryableExportError(err),
      retryKey
    });
  };

  const retryFailedExport = () => {
    const key = exportError?.retryKey;
    setExportError(null);
    if (key === 'history') handleExportLogsExcel();
    else if (key === 'activities') handleExportActivitiesExcel();
    else if (key === 'security') handleExportSecurityExcel();
    else if (key === 'system') handleExportSystemExcel();
    else if (key === 'operators') handleExportOperatorsDirectory();
    else if (key === 'customers') handleExportCustomersDirectory();
  };

  const handleExportActivitiesExcel = async () => {
    setExportError(null);
    try {
      requireExportDates(activitiesFromDate, activitiesToDate);
      const { items: list } = await fetchAllOperatorActivities({
        category: 'activity',
        search: (activitiesSearch || '').trim() || undefined,
        fromDate: toApiDateParam(activitiesFromDate),
        toDate: toApiDateParam(activitiesToDate),
        action: activitiesActionFilter !== 'All' ? activitiesActionFilter : undefined,
        warehouse: selectedWarehouseFilter !== 'All' ? selectedWarehouseFilter : undefined,
        limit: 500
      });
      if (!confirmExportSize(list.length)) throw new Error('Export cancelled.');

      let csvContent = "\uFEFF";
      const headers = ["Timestamp", "DO Name / Operator", "Operator Email", "Allocated Warehouse", "Action Type", "Module Log", "Activity Description"];
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

      list.forEach(act => {
        const timestamp = act.created_at ? new Date(act.created_at).toLocaleString() : '';
        const opEmail = act.operator_email || '-';
        const matchedOp = (operators || []).find(
          (op) => op && op.email && op.email.toLowerCase() === String(opEmail).toLowerCase()
        );
        const opName = matchedOp?.full_name ? String(matchedOp.full_name).trim() : '-';
        const opWarehouse = operatorWarehouseMap[opEmail.toLowerCase()] || 'System / Admin';
        const action = act.action || '-';
        const logType = act.log_type || '-';
        const description = act.description || '-';

        const row = [timestamp, opName, opEmail, opWarehouse, action, logType, description];
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
      });

      downloadCsv(`Operator_Activity_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    } catch (err) {
      setExportFailure(err, 'activities');
    }
  };

  const handleExportOperatorsDirectory = () => {
    setExportError(null);
    try {
      const term = (operatorSearch || '').toLowerCase().trim();
      const list = (operators || []).filter((op) => {
        if (!op) return false;
        if (!term) return true;
        return (
          (op.full_name && op.full_name.toLowerCase().includes(term)) ||
          (op.warehouse_name && op.warehouse_name.toLowerCase().includes(term)) ||
          (op.email && op.email.toLowerCase().includes(term)) ||
          (op.phone_no && String(op.phone_no).toLowerCase().includes(term))
        );
      });
      if (!confirmExportSize(list.length)) throw new Error('Export cancelled.');

      let csvContent = '\uFEFF';
      const headers = [
        'Operator ID',
        'Full Name',
        'Phone No.',
        'Email Address',
        'Warehouse / Data Access',
        'Chambers Assigned',
        'Registration Date'
      ];
      csvContent += headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

      list.forEach((op) => {
        const warehouse = op.warehouse_name || 'Not Configured';
        const accessScope = op.warehouse_name
          ? `Access: ${op.warehouse_name}`
          : 'Access: Not Configured';
        const chambers = String(op.chamber_limit || 4);
        const registered = op.created_at
          ? new Date(op.created_at).toLocaleDateString('en-GB')
          : '-';
        const row = [
          op.id ?? '-',
          op.full_name || '-',
          op.phone_no ? formatIndiaPhoneDisplay(op.phone_no) : '-',
          op.email || '-',
          `${warehouse} | ${accessScope}`,
          chambers,
          registered
        ];
        csvContent += row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',') + '\n';
      });

      downloadCsv(
        `Registered_Operators_Directory_${new Date().toISOString().split('T')[0]}.csv`,
        csvContent
      );
    } catch (err) {
      setExportFailure(err, 'operators');
    }
  };

  const handleExportSecurityExcel = async () => {
    setExportError(null);
    try {
      requireExportDates(securityFromDate, securityToDate);
      const { items: list } = await fetchAllOperatorActivities({
        category: 'security',
        search: (securitySearch || '').trim() || undefined,
        fromDate: toApiDateParam(securityFromDate),
        toDate: toApiDateParam(securityToDate),
        action: securityActionFilter !== 'All' ? securityActionFilter : undefined,
        limit: 500
      });
      if (!confirmExportSize(list.length)) throw new Error('Export cancelled.');

      let csvContent = "\uFEFF";
      const headers = ["Timestamp", "Operator / Identity", "Allocated Warehouse", "Action Type", "Level", "Security Event Description"];
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

      list.forEach(act => {
        const timestamp = act.created_at ? new Date(act.created_at).toLocaleString() : '';
        const opEmail = act.operator_email || 'System / Admin';
        const opWarehouse = operatorWarehouseMap[opEmail.toLowerCase()] || 'System / Admin';
        const action = act.action || '-';
        const level = act.log_type || '-';
        const description = act.description || '-';

        const row = [timestamp, opEmail, opWarehouse, action, level, description];
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
      });

      downloadCsv(`Security_Access_Logs_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    } catch (err) {
      setExportFailure(err, 'security');
    }
  };


  const parseCheckpointDescription = (description) => {
    if (!description || typeof description !== 'string' || !description.includes('[CHECKPOINT]')) {
      return null;
    }
    const parts = {};
    description.split('|').forEach((chunk) => {
      const text = chunk.trim();
      if (!text || text === '[CHECKPOINT]') return;
      const eq = text.indexOf('=');
      if (eq <= 0) return;
      parts[text.slice(0, eq).trim()] = text.slice(eq + 1).trim();
    });
    return Object.keys(parts).length ? parts : null;
  };

  const renderSystemErrorDescription = (description, isError) => {
    const cp = parseCheckpointDescription(description);
    if (!cp) {
      return (
        <span style={{
          fontFamily: isError ? 'monospace' : 'inherit',
          fontSize: isError ? '0.74rem' : '0.78rem',
          color: '#334155'
        }}>
          {description || '-'}
        </span>
      );
    }

    const rows = [
      ['Type', cp.type],
      ['Status', cp.status],
      ['File', cp.file && cp.line ? `${cp.file}:${cp.line}` : (cp.file || null)],
      ['Checkpoint', cp.checkpoint],
      ['Request', cp.method && cp.url ? `${cp.method} ${cp.url}` : (cp.url || cp.method || null)],
      ['Message', cp.msg]
    ].filter(([, v]) => v && v !== '-');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '240px' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: '6px', alignItems: 'baseline', lineHeight: 1.35 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', minWidth: '72px' }}>{label}</span>
            <span style={{
              fontSize: label === 'Message' ? '0.74rem' : '0.72rem',
              fontWeight: label === 'Message' ? 700 : 600,
              color: label === 'Status' && String(value).startsWith('5') ? '#dc2626' : '#334155',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              wordBreak: 'break-word'
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const handleExportSystemExcel = async () => {
    setExportError(null);
    try {
      requireExportDates(systemFromDate, systemToDate);
      const { items: list } = await fetchAllOperatorActivities({
        category: 'system',
        search: (systemSearch || '').trim() || undefined,
        fromDate: toApiDateParam(systemFromDate),
        toDate: toApiDateParam(systemToDate),
        action: systemActionFilter !== 'All' ? systemActionFilter : undefined,
        limit: 500
      });
      if (!confirmExportSize(list.length)) throw new Error('Export cancelled.');

      let csvContent = "\uFEFF";
      const headers = ["Timestamp", "Identity / Source", "Warehouse", "Log Type", "Action Event", "Process & Error Description"];
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

      list.forEach(act => {
        const timestamp = act.created_at ? new Date(act.created_at).toLocaleString() : '';
        const opEmail = act.operator_email || 'system';
        const opWarehouse = operatorWarehouseMap[opEmail.toLowerCase()] || 'System';
        const logType = act.log_type || '-';
        const action = act.action || '-';
        const description = act.description || '-';

        const row = [timestamp, opEmail, opWarehouse, logType, action, description];
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
      });

      downloadCsv(`System_Process_Error_Logs_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    } catch (err) {
      setExportFailure(err, 'system');
    }
  };


  const getFilteredHistoryLogs = () => {
    if (historyTab === 'daily') return chamberLogs;
    if (historyTab === 'inward') return inwardLogs;
    return outwardLogs;
  };

  const handleExportLogsExcel = async () => {
    setLogsExportLoading(true);
    setLogsExportProgressLabel('Exporting…');
    setExportError(null);
    if (exportAbortRef.current) exportAbortRef.current.abort();
    exportAbortRef.current = new AbortController();
    const { signal } = exportAbortRef.current;
    try {
      const { from, to } = requireExportDates(fromDate, toDate);
      setAppliedFromDate(fromDate);
      setAppliedToDate(toDate);
      setAppliedLogsSearch(logsSearch);

      const exportParams = {
        search: logsSearch,
        fromDate: from,
        toDate: to,
        warehouse: selectedWarehouse !== 'All' ? selectedWarehouse : undefined,
        shift: historyTab === 'daily' && historyShiftFilter !== 'All' ? historyShiftFilter : undefined,
        signal
      };
      const onProgress = (p) => setLogsExportProgressLabel(formatExportProgress(p));

      let allItems = [];
      if (historyTab === 'daily') {
        ({ items: allItems } = await fetchAllChamberLogs(exportParams, onProgress));
      } else if (historyTab === 'inward') {
        ({ items: allItems } = await fetchAllInwardLogs(exportParams, onProgress));
      } else {
        ({ items: allItems } = await fetchAllOutwardLogs(exportParams, onProgress));
      }

      let filteredLogs = allItems;

    if (filteredLogs.length === 0) {
      throw new Error('No data available to export.');
    }

    setLogsExportProgressLabel('Building file…');

    const extractFilenames = (pathStr) => {
      if (!pathStr) return '';
      return String(pathStr)
        .split(',')
        .map(p => {
          const parts = p.trim().split(/[/\\]/);
          return parts[parts.length - 1];
        })
        .join(', ');
    };

    const formatDateDisplay = (dateStr) => {
      if (!dateStr) return '';
      const cleaned = dateStr.split('T')[0];
      const parts = cleaned.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const formatDateTimeDisplay = (dtStr) => {
      if (!dtStr) return '';
      try {
        const dt = new Date(dtStr);
        if (isNaN(dt.getTime())) return dtStr;
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();
        let hours = dt.getHours();
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        return `${day}/${month}/${year} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
      } catch {
        return dtStr;
      }
    };

    const formatUpdatedAtDisplay = (created, updated) => {
      if (!created || !updated) return '';
      const cTime = Math.floor(new Date(created).getTime() / 1000);
      const uTime = Math.floor(new Date(updated).getTime() / 1000);
      if (!(uTime > cTime)) return '';
      return formatDateTimeDisplay(updated);
    };

    const dateSuffix = new Date().toISOString().split('T')[0];

    if (historyTab === 'daily') {
      const headers = [
        "Log ID", "Reference No", "Date", "Warehouse Code", "Warehouse Name", "Operator Email", "Chamber Name",
        "Client Code", "Client Name", "Shift", "Inspection Time", "Box Temperature (°C)", "Supervisor Name",
        "Sensor Photo Name", "Photo Capture Time", "Photo Location (GPS)", "Time Variance (minutes)", "Box Count",
        "Chamber Type", "Overdue Status/Time", "Edit Details Log", "Edit Count", "Created At", "Updated At"
      ];
      const rows = filteredLogs.map((log) => [
        log.id || '',
        log.reference_no || '',
        formatDateDisplay(log.formatted_date || log.entry_date),
        log.warehouse_code || '',
        log.warehouse_name || 'Generic',
        log.operator_email || '-',
        log.chamber_name || '',
        log.client_code || '',
        log.client_name || '',
        resolveShiftLabel(log.shift, log.inspection_time, log.created_at),
        log.inspection_time || '',
        log.chamber_temp !== undefined ? `${log.chamber_temp}°C` : (log.box_temp !== undefined ? `${log.box_temp}°C` : ''),
        log.monitor_supervisor_name || '',
        extractFilenames(log.temp_sensor_image),
        log.photo_capture_time || '',
        formatPhotoGpsForExport(
          log.photo_capture_latitude,
          log.photo_capture_longitude,
          log.photo_capture_accuracy
        ),
        log.time_variance_minutes !== undefined ? log.time_variance_minutes : '',
        log.box_count !== undefined ? log.box_count : '',
        log.chamber_type || '',
        log.overdue_time || '',
        log.update_details || '',
        log.update_count !== undefined ? log.update_count : 0,
        formatDateTimeDisplay(log.created_at),
        formatUpdatedAtDisplay(log.created_at, log.updated_at)
      ]);
      downloadCsv(
        `ReeferON_ChamberLogs_SuperAdminExport_${dateSuffix}.csv`,
        toCsvContent(headers, rows)
      );
    } else if (historyTab === 'inward') {
      const headers = [
        "Inward Log ID", "Reference No", "Date", "Warehouse Code", "Warehouse Name", "Operator Email", "Vehicle No", "Seal No", "Invoice No", "Mens Power",
        "Vehicle Temp (°C)", "Material Temp (°C)", "Transporter Name", "Driver Name", "Driver Contact No.", 
        "Client Code", "Client Name", "Dock No", "Vehicle Reporting Time", "Unloading Start Time", "Unloading Duration", 
        "Unloading End Time", "Pallets Qty", "Invoice Qty", "Received Pallets", 
        "Received Boxes", "Short Received Boxes", "Excess Received Boxes", "Damage Received Boxes", "Material Type", 
        "Supervisor Name", "Remarks", "Invoice Photos", "POD Photo", "Vehicle Seal Photo", "Vehicle Temp Photo", 
        "Material Temp Photo", "Vehicle Back Side Photo", "Vehicle Back Side Photo with Material", "Count Sheet Photo", 
        "Damage Boxes Photo", "Photo Capture Time & Location", "Edit Details Log", "Edit Count", "Created At", "Updated At"
      ];
      const rows = filteredLogs.map((log) => [
        log.inward_id || '',
          log.reference_no || '',
          formatDateDisplay(log.inward_entry_date),
          log.warehouse_code || '',
          log.warehouse_name || 'Generic',
          log.operator_email || '-',
          log.inward_vehicle_no || '',
          log.inward_seal_no || '',
          log.inward_invoice_no || '',
          log.inward_mens_power !== undefined && log.inward_mens_power !== null ? log.inward_mens_power : '',
          log.inward_vehicle_temp !== undefined ? `${log.inward_vehicle_temp}°C` : '',
          log.inward_material_temp !== undefined ? `${log.inward_material_temp}°C` : '',
          log.inward_transporter_name || '',
          log.inward_driver_name || '',
          log.inward_driver_no || '',
          log.inward_client_code || '',
          log.inward_client_name || '',
          log.inward_dock_no || '',
          log.inward_vehicle_reporting_time || '',
          log.inward_unloading_start_time || '',
          formatDuration(log.inward_unloading_duration_hours, log.inward_unloading_duration_mins),
          log.inward_unloading_end_time || '',
          log.inward_pallets_in_qty !== undefined ? log.inward_pallets_in_qty : 0,
          log.inward_invoice_qty !== undefined ? log.inward_invoice_qty : 0,
          log.inward_received_qty !== undefined ? log.inward_received_qty : 0,
          log.inward_received_boxes_qty !== undefined ? log.inward_received_boxes_qty : 0,
          log.inward_short_received_boxes_qty !== undefined ? log.inward_short_received_boxes_qty : 0,
          log.inward_excess_received_boxes_qty !== undefined ? log.inward_excess_received_boxes_qty : 0,
          log.inward_damage_received_boxes_qty !== undefined ? log.inward_damage_received_boxes_qty : 0,
          log.inward_material_type || '',
          log.inward_unloading_supervisor_name || '',
          log.inward_remarks || '',
          extractFilenames(log.inward_invoice_photos),
          extractFilenames(log.inward_pod_photo),
          extractFilenames(log.inward_vehicle_seal_photo),
          extractFilenames(log.inward_vehicle_temp_photo),
          extractFilenames(log.inward_material_temp_photo),
          extractFilenames(log.inward_vehicle_back_side_photo),
          extractFilenames(log.inward_vehicle_back_side_photo_with_material),
          extractFilenames(log.inward_count_sheet_photo),
          extractFilenames(log.inward_damage_boxes_photo),
          formatPhotoCaptureMetadataForExport(log.photo_capture_metadata),
          log.update_details || '',
          log.update_count !== undefined ? log.update_count : 0,
          formatDateTimeDisplay(log.inward_created_at),
          formatUpdatedAtDisplay(log.inward_created_at, log.inward_updated_at)
        ]);
      downloadCsv(
        `ReeferON_InwardLogs_SuperAdminExport_${dateSuffix}.csv`,
        toCsvContent(headers, rows)
      );
    } else if (historyTab === 'outward') {
      const headers = [
        "Outward Log ID", "Reference No", "Date", "Warehouse Code", "Warehouse Name", "Operator Email", "Vehicle No", "Seal No", "Invoice No", "Mens Power",
        "Vehicle Temp (°C)", "Pre-Cooling Temp (°C)", "Material Temp (°C)", "Transporter Name", "Driver Name", 
        "Driver Contact No.", "Client Code", "Client Name", "Dock No", "Vehicle Reporting Time", "Loading Start Time", 
        "Loading Duration", "Loading End Time", "Pallets Qty", "Invoice Qty", 
        "Loaded Pallets", "Loaded Boxes", "Short Loaded Boxes", "Excess Loaded Boxes", "Damage Loaded Boxes", "Material Type", 
        "Supervisor Name", "Remarks", "Invoice Photos", "POD Photo", "Vehicle Seal Photo", "Vehicle Temp Photo", 
        "Pre-Cooling Temp Photo", "Material Temp Photo", "Vehicle Back Side Photo", "Vehicle Back Side Photo with Material", 
        "Damage Boxes Photo", "Photo Capture Time & Location", "Edit Details Log", "Edit Count", "Created At", "Updated At"
      ];
      const rows = filteredLogs.map((log) => [
        log.outward_id || '',
          log.reference_no || '',
          formatDateDisplay(log.outward_entry_date),
          log.warehouse_code || '',
          log.warehouse_name || 'Generic',
          log.operator_email || '-',
          log.outward_vehicle_no || '',
          log.outward_seal_no || '',
          log.outward_invoice_no || '',
          log.outward_mens_power !== undefined && log.outward_mens_power !== null ? log.outward_mens_power : '',
          log.outward_vehicle_temp !== undefined ? `${log.outward_vehicle_temp}°C` : '',
          log.outward_pre_vehicle_temp !== undefined ? `${log.outward_pre_vehicle_temp}°C` : '',
          log.outward_material_temp !== undefined ? `${log.outward_material_temp}°C` : '',
          log.outward_transporter_name || '',
          log.outward_driver_name || '',
          log.outward_driver_no || '',
          log.outward_client_code || '',
          log.outward_client_name || '',
          log.outward_dock_no || '',
          log.outward_vehicle_reporting_time || '',
          log.outward_loading_start_time || '',
          formatDuration(log.outward_loading_duration_hours, log.outward_loading_duration_mins),
          log.outward_loading_end_time || '',
          log.outward_pallets_in_qty !== undefined ? log.outward_pallets_in_qty : 0,
          log.outward_invoice_qty !== undefined ? log.outward_invoice_qty : 0,
          log.outward_received_qty !== undefined ? log.outward_received_qty : 0,
          log.outward_received_boxes_qty !== undefined ? log.outward_received_boxes_qty : 0,
          log.outward_short_received_boxes_qty !== undefined ? log.outward_short_received_boxes_qty : 0,
          log.outward_excess_received_boxes_qty !== undefined ? log.outward_excess_received_boxes_qty : 0,
          log.outward_damage_received_boxes_qty !== undefined ? log.outward_damage_received_boxes_qty : 0,
          log.outward_material_type || '',
          log.outward_loading_supervisor_name || '',
          log.outward_remarks || '',
          extractFilenames(log.outward_invoice_photos),
          extractFilenames(log.outward_pod_photo),
          extractFilenames(log.outward_vehicle_seal_photo),
          extractFilenames(log.outward_vehicle_temp_photo),
          extractFilenames(log.outward_pre_vehicle_temp_photo),
          extractFilenames(log.outward_material_temp_photo),
          extractFilenames(log.outward_vehicle_back_side_photo),
          extractFilenames(log.outward_vehicle_back_side_photo_with_material),
          extractFilenames(log.outward_damage_boxes_photo),
          formatPhotoCaptureMetadataForExport(log.photo_capture_metadata),
          log.update_details || '',
          log.update_count !== undefined ? log.update_count : 0,
          formatDateTimeDisplay(log.outward_created_at),
          formatUpdatedAtDisplay(log.outward_created_at, log.outward_updated_at)
        ]);
      downloadCsv(
        `ReeferON_OutwardLogs_SuperAdminExport_${dateSuffix}.csv`,
        toCsvContent(headers, rows)
      );
    }
    } catch (err) {
      setExportFailure(err, 'history');
    } finally {
      setLogsExportLoading(false);
      setLogsExportProgressLabel('Exporting…');
    }
  };

  const handleExportOpChamberClientMappings = (op) => {
    setExportError(null);
    setOpMappingsError('');
    try {
      if (!op?.warehouse_name) {
        throw new Error('Warehouse is not configured for this operator.');
      }
      const displayChambers = getOperatorDisplayChambers(
        opChambersList,
        opMappings,
        op.chamber_limit || 4,
        op.warehouse_name
      );
      if (!displayChambers.length) {
        throw new Error('No chambers or clients to export.');
      }

      const headers = [
        'Operator Name',
        'Operator Email',
        'Warehouse',
        'Chamber',
        'Chamber Type',
        'Client Name',
        'Client Code',
        'Status'
      ];
      const rows = [];

      displayChambers.forEach((chamberRow) => {
        const chamberAssignments = (opMappings || []).filter((m) =>
          assignmentMatchesDisplayChamber(m, chamberRow)
        );
        const activeClients = uniqueClientsByName(
          chamberAssignments.filter((m) => !isDeactiveAssignment(m))
        );
        const activeNames = new Set(
          activeClients.map((m) => String(m.client_name || '').trim().toLowerCase())
        );
        const deactiveClients = uniqueClientsByName(
          chamberAssignments.filter(
            (m) =>
              isDeactiveAssignment(m) &&
              !activeNames.has(String(m.client_name || '').trim().toLowerCase())
          )
        );
        const chamberType =
          activeClients[0]?.chamber_type ||
          deactiveClients[0]?.chamber_type ||
          (chamberRow.chamberNum != null ? opChamberTypeByNum[chamberRow.chamberNum] : null) ||
          chamberRow.chamber_type ||
          'Frozen';

        const base = [
          op.full_name || '',
          op.email || '',
          op.warehouse_name || '',
          chamberRow.name || '',
          chamberType
        ];

        if (!activeClients.length && !deactiveClients.length) {
          rows.push([...base, '', '', 'No clients']);
          return;
        }
        activeClients.forEach((client) => {
          rows.push([
            ...base,
            client.client_name || '',
            client.client_code || '',
            'Active'
          ]);
        });
        deactiveClients.forEach((client) => {
          rows.push([
            ...base,
            client.client_name || '',
            client.client_code || '',
            'Deactive'
          ]);
        });
      });

      const safeName = String(op.full_name || op.email || 'Operator')
        .replace(/[^\w]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'Operator';
      const dateSuffix = new Date().toISOString().split('T')[0];
      downloadCsv(
        `ReeferON_ChamberClientMappings_${safeName}_${dateSuffix}.csv`,
        toCsvContent(headers, rows)
      );
    } catch (err) {
      setOpMappingsError(err.message || 'Failed to export chamber and client mappings.');
    }
  };

  const handleSaveOperator = async (e) => {
    e.preventDefault();
    setOpError('');
    setOpSuccess('');

    if (!opEmail || !opFullName || !opPhoneNo || !opWarehouseName) {
      setOpError('All fields (Full Name, Phone No., Email ID, Warehouse / Data Access) are required.');
      return;
    }
    if (
      warehouseSelectOptions.length > 0 &&
      !warehouseSelectOptions.some(
        (w) => String(w.value).trim().toLowerCase() === String(opWarehouseName).trim().toLowerCase()
      )
    ) {
      setOpError('Select a warehouse from the Master Data list.');
      return;
    }
    const phoneLocal = toLocalTenDigitPhone(opPhoneNo);
    if (phoneLocal.length !== 10) {
      setOpError('Phone No. must be exactly 10 digits.');
      return;
    }

    if (!editingOp && !opPassword) {
      setOpError('Password is required for registration.');
      return;
    }

    setSavingOp(true);
    try {
      const payload = {
        email: opEmail,
        password: opPassword,
        full_name: opFullName,
        phone_no: toStoredIndiaPhone(phoneLocal),
        warehouse_name: String(opWarehouseName || '').trim(),
        warehouse_code: (() => {
          const selected = String(opWarehouseName || '').trim().toLowerCase();
          const hit = (accessScopeOptions.warehouseMasters || []).find((w) => {
            const code = String(w.warehouse_code || '').trim().toLowerCase();
            const name = String(w.warehouse_name || '').trim().toLowerCase();
            const label = formatMasterLabel(w.warehouse_code, w.warehouse_name).toLowerCase();
            return code === selected || name === selected || label === selected;
          });
          return hit?.warehouse_code || undefined;
        })(),
        chamber_limit: opChamberLimit
      };

      if (editingOp) {
        setOpProcessStatus('Updating operator profile & Warehouse / Data Access…');
        const updated = await updateOperator(editingOp.id, payload);
        const synced = Number(updated?.past_logs_synced || 0);
        setOpSuccess(
          synced > 0
            ? `Operator updated. Warehouse / Data Access applied to profile and ${synced} past log(s).`
            : 'Operator profile & Warehouse / Data Access updated successfully.'
        );
      } else {
        setOpProcessStatus('Creating operator account…');
        // Yield so overlay paints before the network/email wait
        await new Promise((r) => setTimeout(r, 50));
        setOpProcessStatus('Creating account & sending credentials email…');
        const created = await createOperator(payload);
        if (created?.emailSent) {
          setOpProcessStatus('Email sent successfully.');
          setOpSuccess('Data operator registered with Warehouse / Data Access. Login credentials emailed successfully.');
        } else if (created?.emailSkipped) {
          setOpSuccess(
            created?.emailError
              || 'Data operator registered. Email skipped — set SMTP_USER and SMTP_PASS (Gmail App Password) in backend .env and restart server.'
          );
        } else {
          setOpSuccess(
            `Data operator registered, but email failed${created?.emailError ? `: ${created.emailError}` : '.'}`
          );
        }
      }

      cancelEditOperator();
      loadOperatorsData();
      loadAccessScopeOptions();
    } catch (err) {
      setOpError(err.message || 'Action failed.');
    } finally {
      setSavingOp(false);
      setOpProcessStatus('');
    }
  };

  const clearPendingOperatorDeleteTimers = () => {
    if (pendingOperatorDeleteTimerRef.current) {
      clearTimeout(pendingOperatorDeleteTimerRef.current);
      pendingOperatorDeleteTimerRef.current = null;
    }
    if (pendingOperatorDeleteTickRef.current) {
      clearInterval(pendingOperatorDeleteTickRef.current);
      pendingOperatorDeleteTickRef.current = null;
    }
  };

  const restorePendingOperatorToUi = (pending) => {
    if (!pending?.operator) return;
    setOperators((prev) =>
      prev.some((o) => Number(o.id) === Number(pending.id))
        ? prev
        : [pending.operator, ...prev]
    );
  };

  const commitPendingOperatorDelete = async (pending) => {
    if (!pending) return;
    try {
      await deleteOperator(pending.id);
      setOpSuccess('Operator credentials deleted successfully.');
    } catch (err) {
      restorePendingOperatorToUi(pending);
      setOpError(err.message || 'Failed to delete operator. It was restored to the list.');
    }
  };

  const finalizePendingOperatorDelete = async () => {
    const pending = pendingOperatorDeleteRef.current;
    clearPendingOperatorDeleteTimers();
    pendingOperatorDeleteRef.current = null;
    setPendingOperatorDelete(null);
    if (pending) await commitPendingOperatorDelete(pending);
  };

  const handleUndoOperatorDelete = () => {
    const pending = pendingOperatorDeleteRef.current;
    clearPendingOperatorDeleteTimers();
    pendingOperatorDeleteRef.current = null;
    setPendingOperatorDelete(null);
    if (!pending) return;
    restorePendingOperatorToUi(pending);
    setOpSuccess('Operator revoke undone.');
  };

  const handleDeleteOperator = async (op) => {
    if (!op?.id) return;
    const id = op.id;
    const label = op.full_name || op.email || `#${id}`;
    if (
      !window.confirm(
        `Revoke workspace access for ${label}?\n\nYou can Undo for 30 seconds.`
      )
    ) {
      return;
    }

    setOpError('');
    setOpSuccess('');

    // Commit any other pending undo deletes first
    if (pendingLogDeleteRef.current) {
      await finalizePendingLogDelete();
    }
    if (pendingCustomerDeleteRef.current) {
      await finalizePendingCustomerDelete();
    }
    if (pendingMasterDeleteRef.current) {
      await finalizePendingMasterDelete();
    }
    if (pendingOperatorDeleteRef.current) {
      await finalizePendingOperatorDelete();
    }

    const snapshot = { ...op };
    setOperators((prev) => prev.filter((o) => Number(o.id) !== Number(id)));
    if (editingOp && Number(editingOp.id) === Number(id)) {
      cancelEditOperator();
    }
    if (viewingOperator && Number(viewingOperator.id) === Number(id)) {
      closeOperatorProfile();
    }

    const pending = {
      id,
      operator: snapshot,
      label,
      secondsLeft: 30
    };
    pendingOperatorDeleteRef.current = pending;
    setPendingOperatorDelete(pending);

    pendingOperatorDeleteTickRef.current = setInterval(() => {
      setPendingOperatorDelete((prev) => {
        if (!prev) return null;
        const next = prev.secondsLeft - 1;
        if (next <= 0) return prev;
        return { ...prev, secondsLeft: next };
      });
    }, 1000);

    pendingOperatorDeleteTimerRef.current = setTimeout(() => {
      finalizePendingOperatorDelete();
    }, 30000);
  };

  const startEditOperator = (op) => {
    setViewingOperator(null);
    setEditingOp(op);
    setOpEmail(op.email);
    setOpFullName(op.full_name || '');
    setOpPhoneNo(toLocalTenDigitPhone(op.phone_no));
    setOpWarehouseName(op.warehouse_name || '');
    setOpChamberLimit(op.chamber_limit || 4);
    setOpAssignedChambers(op.chamber_limit || 4);
    setOpNotes('');
    setOpDirMenuId(null);
    setOpPassword(''); // Leave blank unless updating
    setOpError('');
    setOpSuccess('');
  };

  const openOperatorProfile = async (op) => {
    if (!op) return;
    const emailKey = String(op.email || '').trim().toLowerCase();
    const fromTasks = (doTaskOverview?.operators || []).find(
      (row) => String(row.email || '').trim().toLowerCase() === emailKey
    );
    setEditingOp(null);
    setViewingOperator({
      ...op,
      total_inward: Number(op.total_inward ?? fromTasks?.total_inward) || 0,
      total_outward: Number(op.total_outward ?? fromTasks?.total_outward) || 0,
      today_inward: Number(op.today_inward ?? fromTasks?.today_inward) || 0,
      today_outward: Number(op.today_outward ?? fromTasks?.today_outward) || 0,
      io_counts_loading: true
    });
    setOpProfileSection('overview');
    setExpandedOpMappingsId(null);
    setOpMapSearch('');
    setOpMapChamberFilter('all');
    setOpMapExpanded({});
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setOpMasterActivitiesError('');
    setOpMasterActivityFilter('all');
    setOpMasterActivityPage(1);
    setOpMasterEditMode(false);
    setOpMasterEditChamberKey(null);
    setOpMasterSessionChanges([]);
    setOpMasterDonePopup(null);
    setNewClientInputs({});
    setNewChamberTypes({});
    setOpNewChamberName('');
    setOpNewChamberType('Frozen');
    setOpMasterActivities([]);
    setOpMasterActivitiesError('');
    const { fromDate, toDate } = getDefaultOpTaskRange(7); // task status: last 7 days
    const masterRange = getDefaultOpTaskRange(30); // master activity: last 30 days
    setOpTaskFromDate(fromDate);
    setOpTaskToDate(toDate);
    setOpTaskAppliedFrom(fromDate);
    setOpTaskAppliedTo(toDate);
    setOpMasterFromDate(masterRange.fromDate);
    setOpMasterToDate(masterRange.toDate);
    setOpMasterAppliedFrom(masterRange.fromDate);
    setOpMasterAppliedTo(masterRange.toDate);
    setOpTaskFilter('all');
    setOpTaskChamberFilter('all');
    setOpTaskListPage(1);
    setOpTimelinePage(1);
    setOpTaskLogs([]);
    setOpTaskLogsError('');
    setOpIoByDate({});

    const loadIoCounts = (async () => {
      try {
        const counts = await fetchDoOperatorIoCounts(op.email, {
          fromDate,
          toDate
        });
        setViewingOperator((prev) => {
          if (!prev || String(prev.email || '').toLowerCase() !== emailKey) return prev;
          return {
            ...prev,
            total_inward: Number(counts.total_inward) || 0,
            total_outward: Number(counts.total_outward) || 0,
            today_inward: Number(counts.today_inward) || 0,
            today_outward: Number(counts.today_outward) || 0,
            io_counts_loading: false,
            io_counts_today: counts.today || localDateStr()
          };
        });
        if (counts?.by_date && typeof counts.by_date === 'object') {
          setOpIoByDate(counts.by_date);
        }
      } catch (err) {
        console.warn('DO profile IO counts failed:', err.message || err);
        setViewingOperator((prev) => {
          if (!prev || String(prev.email || '').toLowerCase() !== emailKey) return prev;
          return { ...prev, io_counts_loading: false };
        });
      }
    })();

    if (op.warehouse_name) {
      await loadOpMappings(op.warehouse_name);
    } else {
      setOpMappings([]);
    }
    await Promise.all([
      loadOpMasterActivities(op.email),
      loadOpTaskStatus(op, fromDate, toDate),
      loadIoCounts
    ]);
  };

  const openDoFromDashboard = (row) => {
    if (!row) return;
    const match = (operators || []).find((op) =>
      (row.id != null && Number(op.id) === Number(row.id))
      || (op.email && row.email && String(op.email).toLowerCase() === String(row.email).toLowerCase())
    );
    const op = match || {
      id: row.id,
      email: row.email,
      full_name: row.full_name || row.name,
      phone_no: row.phone_no,
      warehouse_name: row.warehouse_name,
      warehouse_code: row.warehouse_code,
      chamber_limit: row.chamber_limit
    };
    setActiveMenu('data_operators');
    openOperatorProfile({
      ...op,
      total_inward: row.total_inward ?? match?.total_inward ?? 0,
      total_outward: row.total_outward ?? match?.total_outward ?? 0,
      today_inward: row.today_inward ?? match?.today_inward ?? 0,
      today_outward: row.today_outward ?? match?.today_outward ?? 0
    });
  };

  const openChamberTaskProfile = async (task, op) => {
    const openDailyLog = (log) => {
      if (!log) return;
      setActiveMenu('profile_lookup');
      setSearchedRecord(log);
      setSearchedRecordType('daily');
      loadRecordAllowHistory('daily', log);
      setLookupQuery(log.reference_no || task.client_name || '');
      setSearchResults([{
        type: 'daily',
        label: 'Chamber Temp',
        reference_no: log.reference_no,
        date: task.date,
        facility: log.warehouse_name || op?.warehouse_name || 'Generic',
        client: task.client_name,
        details: `${task.chamber_name} · ${task.shift} · ${log.chamber_temp != null ? `${log.chamber_temp}°C` : '—'}`,
        original: log
      }]);
    };

    if (task?.log) {
      openDailyLog(task.log);
      return;
    }

    if (task?.reference_no) {
      try {
        const res = await fetchChamberLogs('', {
          paginated: true,
          search: task.reference_no,
          page: 1,
          limit: 10,
          warehouse: op?.warehouse_name
        });
        const log =
          (res.items || []).find((l) => l.reference_no === task.reference_no) ||
          (res.items || [])[0];
        if (log) {
          openDailyLog(log);
          return;
        }
      } catch (err) {
        console.error('Failed to open task profile:', err);
      }
    }

    alert('No submitted log found for this task yet.');
  };

  const closeOperatorProfile = () => {
    if (pendingMasterDeleteRef.current) {
      finalizePendingMasterDelete();
    }
    setViewingOperator(null);
    setOpProfileSection('overview');
    setOpMappings([]);
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setOpMasterActivities([]);
    setOpMasterActivitiesError('');
    setOpMasterActivityFilter('all');
    setOpMasterActivityPage(1);
    setOpMasterEditMode(false);
    setOpMasterEditChamberKey(null);
    setOpMasterSessionChanges([]);
    setOpMasterDonePopup(null);
    setNewClientInputs({});
    setNewChamberTypes({});
    setOpNewChamberName('');
    setOpNewChamberType('Frozen');
    setOpMasterFromDate('');
    setOpMasterToDate('');
    setOpMasterAppliedFrom('');
    setOpMasterAppliedTo('');
    opMasterActivitiesEmailRef.current = '';
    setOpTaskFromDate('');
    setOpTaskToDate('');
    setOpTaskAppliedFrom('');
    setOpTaskAppliedTo('');
    setOpTaskLogs([]);
    setOpTaskLogsError('');
    setOpIoByDate({});
    setOpTaskFilter('all');
    setOpTaskChamberFilter('all');
    setOpMapSearch('');
    setOpMapChamberFilter('all');
    setOpMapExpanded({});
  };

  const resetOperatorForm = () => {
    if (editingOp) {
      startEditOperator(editingOp);
      return;
    }
    cancelEditOperator();
  };

  /** Register/list screen — closes DO profile so the form is visible (not task-status profile). */
  const openDataOperatorsHome = () => {
    setViewingOperator(null);
    setEditingOp(null);
    setOpError('');
    setOpSuccess('');
    setActiveMenu('data_operators');
  };

  const cancelEditOperator = () => {
    setEditingOp(null);
    setOpEmail('');
    setOpFullName('');
    setOpPhoneNo('');
    setOpWarehouseName('');
    setOpWarehouseSuggestOpen(false);
    setOpChamberLimit(4);
    setOpAssignedChambers(4);
    setOpNotes('');
    setOpDirMenuId(null);
    setOpPassword('');
    setShowPassword(false);
    setOpError('');
    setOpSuccess('');
    setOperatorSearch('');
  };

  // Customers CRUD handlers
  const loadSubAdminsData = async () => {
    setLoadingSubAdmins(true);
    setSubAdminError('');
    try {
      const data = await fetchSubAdmins();
      setSubAdmins(Array.isArray(data) ? data : []);
    } catch (err) {
      setSubAdminError(err.message || 'Failed to fetch customers.');
      setSubAdmins([]);
    } finally {
      setLoadingSubAdmins(false);
    }
  };

  const loadAccessScopeOptions = async () => {
    try {
      const [data, warehouseMasters, clientMasters] = await Promise.all([
        fetchAccessScopeOptions(),
        fetchMasterWarehouses({ activeOnly: true }).catch(() => []),
        fetchMasterClients({ activeOnly: true }).catch(() => [])
      ]);
      setAccessScopeOptions({
        clients: Array.isArray(data?.clients) ? data.clients : [],
        warehouses: Array.isArray(data?.warehouses) ? data.warehouses : [],
        warehouseClients:
          data?.warehouseClients && typeof data.warehouseClients === 'object'
            ? data.warehouseClients
            : {},
        warehouseMasters: Array.isArray(warehouseMasters) ? warehouseMasters : [],
        clientMasters: Array.isArray(clientMasters) ? clientMasters : []
      });
    } catch (err) {
      console.error('Failed to load access scope options:', err);
      setAccessScopeOptions({
        clients: [],
        warehouses: [],
        warehouseClients: {},
        warehouseMasters: [],
        clientMasters: []
      });
    }
  };

  const warehouseSelectOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    (accessScopeOptions.warehouseMasters || []).forEach((w) => {
      const name = String(w.warehouse_name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        value: name,
        code: w.warehouse_code || '',
        label: formatMasterLabel(w.warehouse_code, w.warehouse_name)
      });
    });
    (accessScopeOptions.warehouses || []).forEach((name) => {
      const n = String(name || '').trim();
      const key = n.toLowerCase();
      if (!n || seen.has(key)) return;
      seen.add(key);
      out.push({ value: n, code: '', label: n });
    });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [accessScopeOptions.warehouseMasters, accessScopeOptions.warehouses]);

  const warehouseTypeSuggestions = useMemo(() => {
    const q = String(opWarehouseName || '').trim().toLowerCase();
    if (!q) return warehouseSelectOptions.slice(0, 12);
    return warehouseSelectOptions
      .filter((w) => {
        const label = String(w.label || '').toLowerCase();
        const value = String(w.value || '').toLowerCase();
        const code = String(w.code || '').toLowerCase();
        return label.includes(q) || value.includes(q) || code.includes(q);
      })
      .slice(0, 12);
  }, [warehouseSelectOptions, opWarehouseName]);

  // Clients shown in Customer form = linked to selected warehouses (name OR code)
  const subAdminClientOptions = useMemo(() => {
    if (!subAdminSelectedWarehouses.length) return [];
    const selectedKeys = new Set();
    subAdminSelectedWarehouses.forEach((w) => {
      const s = String(w || '').trim().toLowerCase();
      if (!s) return;
      selectedKeys.add(s);
      (accessScopeOptions.warehouseMasters || []).forEach((m) => {
        const name = String(m.warehouse_name || '').trim().toLowerCase();
        const code = String(m.warehouse_code || '').trim().toLowerCase();
        if (s === name || s === code) {
          if (name) selectedKeys.add(name);
          if (code) selectedKeys.add(code);
        }
      });
    });
    const seen = new Set();
    const out = [];

    const pushOpt = (value, label) => {
      const v = String(value || '').trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ value: v, label: label || v });
    };

    (accessScopeOptions.clientMasters || []).forEach((c) => {
      const whCode = String(c.warehouse_code || '').trim().toLowerCase();
      const whName = String(c.warehouse_name || '').trim().toLowerCase();
      if (selectedKeys.has(whCode) || selectedKeys.has(whName)) {
        // Prefer display name — matches how scope is stored / used on mobile
        pushOpt(
          c.client_name || c.client_code,
          formatMasterLabel(c.client_code, c.client_name)
        );
      }
    });

    const map = accessScopeOptions.warehouseClients || {};
    Object.entries(map).forEach(([wh, clients]) => {
      const key = String(wh).trim().toLowerCase();
      if (!selectedKeys.has(key)) return;
      (clients || []).forEach((c) => pushOpt(c, c));
    });

    // Fallback: flat clients list from access-options when masters/map empty
    if (out.length === 0 && Array.isArray(accessScopeOptions.clients)) {
      accessScopeOptions.clients.forEach((c) => pushOpt(c, c));
    }

    return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [accessScopeOptions.warehouseClients, accessScopeOptions.clientMasters, accessScopeOptions.clients, accessScopeOptions.warehouseMasters, subAdminSelectedWarehouses]);

  // Drop selected clients that no longer belong to selected warehouses
  useEffect(() => {
    if (!subAdminSelectedWarehouses.length) {
      setSubAdminSelectedClients((prev) => (prev.length ? [] : prev));
      return;
    }
    // Wait until options loaded — don't wipe saved clients while list still empty
    if (!subAdminClientOptions.length) return;
    setSubAdminSelectedClients((prev) => {
      const allowed = new Set();
      const codeToName = new Map();
      (accessScopeOptions.clientMasters || []).forEach((c) => {
        const name = String(c.client_name || '').trim();
        const code = String(c.client_code || '').trim();
        if (name) allowed.add(name.toLowerCase());
        if (code) {
          allowed.add(code.toLowerCase());
          if (name) codeToName.set(code.toLowerCase(), name);
        }
      });
      subAdminClientOptions.forEach((c) => {
        allowed.add(String(c.value || c).trim().toLowerCase());
      });
      const next = prev
        .map((c) => {
          const raw = String(c || '').trim();
          if (!raw) return '';
          const key = raw.toLowerCase();
          if (codeToName.has(key)) return codeToName.get(key);
          return raw;
        })
        .filter((c) => c && allowed.has(String(c).trim().toLowerCase()));
      // de-dupe after code→name normalize
      const seen = new Set();
      const deduped = [];
      next.forEach((c) => {
        const k = c.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        deduped.push(c);
      });
      if (deduped.length === prev.length && deduped.every((v, i) => v === prev[i])) return prev;
      return deduped;
    });
  }, [subAdminSelectedWarehouses, subAdminClientOptions, accessScopeOptions.clientMasters]);

  const handleSaveSubAdmin = async (e) => {
    e.preventDefault();
    setSubAdminError('');
    setSubAdminSuccess('');

    if (!subAdminEmail || !subAdminFullName || !subAdminPhoneNo) {
      setSubAdminError('All fields (Full Name, Phone No., Email ID) are required.');
      return;
    }
    const phoneLocal = toLocalTenDigitPhone(subAdminPhoneNo);
    if (phoneLocal.length !== 10) {
      setSubAdminError('Phone No. must be exactly 10 digits.');
      return;
    }

    if (!editingSubAdmin && !subAdminPassword) {
      setSubAdminError('Password is required for registration.');
      return;
    }

    setSavingSubAdmin(true);
    try {
      const payload = {
        email: subAdminEmail,
        password: subAdminPassword,
        full_name: subAdminFullName,
        phone_no: toStoredIndiaPhone(phoneLocal),
        allowed_clients: subAdminSelectedClients.length > 0 ? subAdminSelectedClients : null,
        allowed_warehouses: subAdminSelectedWarehouses.length > 0 ? subAdminSelectedWarehouses : null
      };

      if (editingSubAdmin) {
        setSubAdminProcessStatus('Updating Customer profile…');
        await updateSubAdmin(editingSubAdmin.id, payload);
        setSubAdminSuccess('Customer profile updated successfully.');
      } else {
        setSubAdminProcessStatus('Creating Customer account…');
        await new Promise((r) => setTimeout(r, 50));
        setSubAdminProcessStatus('Creating account & sending credentials email…');
        const created = await createSubAdmin(payload);
        if (created?.emailSent) {
          setSubAdminProcessStatus('Email sent successfully.');
          setSubAdminSuccess('Customer registered. Login credentials emailed successfully.');
        } else if (created?.emailSkipped) {
          setSubAdminSuccess(
            created?.emailError
              || 'Customer registered. Email skipped — set SMTP_USER and SMTP_PASS (Gmail App Password) in backend .env and restart server.'
          );
        } else {
          setSubAdminSuccess(
            `Customer registered, but email failed${created?.emailError ? `: ${created.emailError}` : '.'}`
          );
        }
      }

      cancelEditSubAdmin();
      loadSubAdminsData();
      loadDashboardStatsData();
    } catch (err) {
      setSubAdminError(err.message || 'Action failed.');
    } finally {
      setSavingSubAdmin(false);
      setSubAdminProcessStatus('');
    }
  };

  const clearPendingCustomerDeleteTimers = () => {
    if (pendingCustomerDeleteTimerRef.current) {
      clearTimeout(pendingCustomerDeleteTimerRef.current);
      pendingCustomerDeleteTimerRef.current = null;
    }
    if (pendingCustomerDeleteTickRef.current) {
      clearInterval(pendingCustomerDeleteTickRef.current);
      pendingCustomerDeleteTickRef.current = null;
    }
  };

  const restorePendingCustomerToUi = (pending) => {
    if (!pending?.customer) return;
    setSubAdmins((prev) =>
      prev.some((c) => Number(c.id) === Number(pending.id))
        ? prev
        : [pending.customer, ...prev]
    );
  };

  const commitPendingCustomerDelete = async (pending) => {
    if (!pending) return;
    try {
      await deleteSubAdmin(pending.id);
      setSubAdminSuccess('Customer credentials deleted successfully.');
      loadDashboardStatsData();
    } catch (err) {
      restorePendingCustomerToUi(pending);
      setSubAdminError(err.message || 'Failed to delete customer. It was restored to the list.');
    }
  };

  const finalizePendingCustomerDelete = async () => {
    const pending = pendingCustomerDeleteRef.current;
    clearPendingCustomerDeleteTimers();
    pendingCustomerDeleteRef.current = null;
    setPendingCustomerDelete(null);
    if (pending) await commitPendingCustomerDelete(pending);
  };

  const handleUndoCustomerDelete = () => {
    const pending = pendingCustomerDeleteRef.current;
    clearPendingCustomerDeleteTimers();
    pendingCustomerDeleteRef.current = null;
    setPendingCustomerDelete(null);
    if (!pending) return;
    restorePendingCustomerToUi(pending);
    setSubAdminSuccess('Customer revoke undone.');
  };

  const handleDeleteSubAdmin = async (sa) => {
    if (!sa?.id) return;
    const id = sa.id;
    const label = sa.full_name || sa.email || `#${id}`;
    if (
      !window.confirm(
        `Revoke workspace access for ${label}?\n\nYou can Undo for 30 seconds.`
      )
    ) {
      return;
    }

    setSubAdminError('');
    setSubAdminSuccess('');

    if (pendingLogDeleteRef.current) {
      await finalizePendingLogDelete();
    }
    if (pendingOperatorDeleteRef.current) {
      await finalizePendingOperatorDelete();
    }
    if (pendingMasterDeleteRef.current) {
      await finalizePendingMasterDelete();
    }
    if (pendingCustomerDeleteRef.current) {
      await finalizePendingCustomerDelete();
    }

    const snapshot = { ...sa };
    setSubAdmins((prev) => prev.filter((c) => Number(c.id) !== Number(id)));
    if (editingSubAdmin && Number(editingSubAdmin.id) === Number(id)) {
      cancelEditSubAdmin();
    }

    const pending = {
      id,
      customer: snapshot,
      label,
      secondsLeft: 30
    };
    pendingCustomerDeleteRef.current = pending;
    setPendingCustomerDelete(pending);

    pendingCustomerDeleteTickRef.current = setInterval(() => {
      setPendingCustomerDelete((prev) => {
        if (!prev) return null;
        const next = prev.secondsLeft - 1;
        if (next <= 0) return prev;
        return { ...prev, secondsLeft: next };
      });
    }, 1000);

    pendingCustomerDeleteTimerRef.current = setTimeout(() => {
      finalizePendingCustomerDelete();
    }, 30000);
  };

  const resetSubAdminForm = () => {
    if (editingSubAdmin) {
      startEditSubAdmin(editingSubAdmin);
      return;
    }
    setSubAdminEmail('');
    setSubAdminFullName('');
    setSubAdminPhoneNo('');
    setSubAdminPassword('');
    setSubAdminSelectedClients([]);
    setSubAdminSelectedWarehouses([]);
    setSubAdminNotes('');
    setCustDirMenuId(null);
    setShowPassword(false);
    setSubAdminError('');
    setSubAdminSuccess('');
  };

  const handleExportCustomersDirectory = () => {
    setExportError(null);
    try {
      const term = (subAdminSearch || '').toLowerCase().trim();
      const list = (subAdmins || []).filter((sa) => {
        if (!sa) return false;
        if (!term) return true;
        return (
          (sa.full_name && sa.full_name.toLowerCase().includes(term)) ||
          (sa.email && sa.email.toLowerCase().includes(term)) ||
          (sa.phone_no && String(sa.phone_no).toLowerCase().includes(term)) ||
          (sa.allowed_warehouses && String(sa.allowed_warehouses).toLowerCase().includes(term))
        );
      });
      if (!confirmExportSize(list.length)) throw new Error('Export cancelled.');
      let csvContent = '\uFEFF';
      const headers = [
        'Customer ID',
        'Full Name',
        'Phone No.',
        'Email Address',
        'Allowed Warehouses',
        'Allowed Clients',
        'Registration Date'
      ];
      csvContent += headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
      list.forEach((sa) => {
        const registered = sa.created_at
          ? new Date(sa.created_at).toLocaleDateString('en-GB')
          : '-';
        const row = [
          sa.id ?? '-',
          sa.full_name || '-',
          sa.phone_no ? formatIndiaPhoneDisplay(sa.phone_no) : '-',
          sa.email || '-',
          sa.allowed_warehouses || 'All warehouses',
          sa.allowed_clients || 'All products',
          registered
        ];
        csvContent += row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',') + '\n';
      });
      downloadCsv(`Customers_Directory_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    } catch (err) {
      setExportFailure(err, 'customers');
    }
  };

  const startEditSubAdmin = (sa) => {
    setEditingSubAdmin(sa);
    setSubAdminEmail(sa.email);
    setSubAdminFullName(sa.full_name || '');
    setSubAdminPhoneNo(toLocalTenDigitPhone(sa.phone_no));
    setSubAdminPassword('');
    setSubAdminNotes('');
    setCustDirMenuId(null);
    // Normalize client tokens to master client_name when possible
    const rawClients = sa.allowed_clients
      ? sa.allowed_clients.split(',').map((c) => c.trim()).filter(Boolean)
      : [];
    const clientMasters = accessScopeOptions.clientMasters || [];
    const normalizedClients = rawClients.map((token) => {
      const t = String(token).trim().toLowerCase();
      const hit = clientMasters.find((m) => {
        const name = String(m.client_name || '').trim().toLowerCase();
        const code = String(m.client_code || '').trim().toLowerCase();
        return t === name || t === code;
      });
      return hit?.client_name || token;
    });
    setSubAdminSelectedClients(normalizedClients);
    // Normalize warehouse tokens to master warehouse_name when possible
    const rawWh = sa.allowed_warehouses
      ? sa.allowed_warehouses.split(',').map((w) => w.trim()).filter(Boolean)
      : [];
    const masters = accessScopeOptions.warehouseMasters || [];
    const normalizedWh = rawWh.map((token) => {
      const t = String(token).trim().toLowerCase();
      const hit = masters.find((m) => {
        const name = String(m.warehouse_name || '').trim().toLowerCase();
        const code = String(m.warehouse_code || '').trim().toLowerCase();
        return t === name || t === code;
      });
      return hit?.warehouse_name || token;
    });
    setSubAdminSelectedWarehouses(normalizedWh);
    setSubAdminError('');
    setSubAdminSuccess('');
    loadAccessScopeOptions();
  };

  const cancelEditSubAdmin = () => {
    setEditingSubAdmin(null);
    setSubAdminEmail('');
    setSubAdminFullName('');
    setSubAdminPhoneNo('');
    setSubAdminPassword('');
    setSubAdminSelectedClients([]);
    setSubAdminSelectedWarehouses([]);
    setSubAdminNotes('');
    setCustDirMenuId(null);
    setShowPassword(false);
    setSubAdminError('');
    setSubAdminSuccess('');
    setSubAdminSearch('');
  };

  // After access-options / masters load, re-normalize chips while editing
  useEffect(() => {
    if (!editingSubAdmin) return;
    const whMasters = accessScopeOptions.warehouseMasters || [];
    const clMasters = accessScopeOptions.clientMasters || [];
    if (!whMasters.length && !clMasters.length) return;

    if (whMasters.length) {
      setSubAdminSelectedWarehouses((prev) => {
        if (!prev.length) return prev;
        let changed = false;
        const next = prev.map((token) => {
          const t = String(token).trim().toLowerCase();
          const hit = whMasters.find((m) => {
            const name = String(m.warehouse_name || '').trim().toLowerCase();
            const code = String(m.warehouse_code || '').trim().toLowerCase();
            return t === name || t === code;
          });
          if (hit?.warehouse_name && hit.warehouse_name !== token) {
            changed = true;
            return hit.warehouse_name;
          }
          return token;
        });
        return changed ? next : prev;
      });
    }

    if (clMasters.length) {
      setSubAdminSelectedClients((prev) => {
        if (!prev.length) return prev;
        let changed = false;
        const next = prev.map((token) => {
          const t = String(token).trim().toLowerCase();
          const hit = clMasters.find((m) => {
            const name = String(m.client_name || '').trim().toLowerCase();
            const code = String(m.client_code || '').trim().toLowerCase();
            return t === name || t === code;
          });
          if (hit?.client_name && hit.client_name !== token) {
            changed = true;
            return hit.client_name;
          }
          return token;
        });
        return changed ? next : prev;
      });
    }
  }, [editingSubAdmin, accessScopeOptions.warehouseMasters, accessScopeOptions.clientMasters]);

  const clearProfilePasswordForm = () => {
    setNewAdminPassword('');
    setConfirmAdminPassword('');
    setProfileEmail(user?.email || '');
    setOldProfileEmail(user?.email || '');
    setProfileAccessId(user?.email || '');
    setProfileAccessPassword('');
    setProfileAccessVerified(false);
    setProfileAccessLoading(false);
    setProfileAccessErr('');
    setProfilePwdMsg('');
    setProfilePwdErr('');
    setShowCurrentAdminPassword(false);
    setShowNewAdminPassword(false);
    setShowConfirmAdminPassword(false);
    setShowProfileConfirm(false);
    setProfileConfirmSummary(null);
  };

  const resetAppSubAdminForm = () => {
    setAppSubFullName('');
    setAppSubPhone('');
    setAppSubEmail('');
    setAppSubPassword('');
    setShowAppSubPassword(false);
  };

  const loadAppSubAdminsList = async () => {
    setAppSubAdminLoading(true);
    setAppSubAdminErr('');
    try {
      const rows = await fetchAppSubAdmins();
      setAppSubAdmins(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setAppSubAdmins([]);
      setAppSubAdminErr(err.message || 'Failed to load Sub-Admins.');
    } finally {
      setAppSubAdminLoading(false);
    }
  };

  const handleCreateAppSubAdmin = async (e) => {
    e.preventDefault();
    setAppSubAdminErr('');
    setAppSubAdminMsg('');
    if (!appSubFullName.trim() || !appSubPhone.trim() || !appSubEmail.trim() || !appSubPassword) {
      setAppSubAdminErr('Name, number, email and password are all required.');
      return;
    }
    setAppSubAdminSaving(true);
    try {
      const created = await createAppSubAdmin({
        full_name: appSubFullName.trim(),
        phone_no: appSubPhone.trim(),
        email: appSubEmail.trim().toLowerCase(),
        password: appSubPassword
      });
      setAppSubAdminMsg('Sub-Admin registered for mobile (full app access).');
      resetAppSubAdminForm();
      // Optimistic row so UI updates even if list refresh is slow
      if (created?.id) {
        setAppSubAdmins((prev) => [
          {
            id: created.id,
            email: created.email,
            full_name: created.full_name,
            phone_no: created.phone_no,
            created_at: new Date().toISOString()
          },
          ...prev.filter((r) => r.id !== created.id)
        ]);
      }
      await loadAppSubAdminsList();
    } catch (err) {
      setAppSubAdminErr(err.message || 'Failed to create Sub-Admin.');
    } finally {
      setAppSubAdminSaving(false);
    }
  };

  const handleDeleteAppSubAdmin = async (id) => {
    if (!window.confirm('Delete this Sub-Admin account? They will lose mobile access.')) return;
    setAppSubAdminErr('');
    setAppSubAdminMsg('');
    try {
      await deleteAppSubAdmin(id);
      setAppSubAdminMsg('Sub-Admin deleted.');
      setAppSubAdmins((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setAppSubAdminErr(err.message || 'Failed to delete Sub-Admin.');
      await loadAppSubAdminsList();
    }
  };

  const openSuperAdminProfileWindow = () => {
    setSaEditLog(null);
    clearProfilePasswordForm();
    setProfileAccessId(user?.email || '');
    setProfileEmail(user?.email || '');
    setOldProfileEmail(user?.email || '');
    setActiveMenu('super_admin_profile');
  };

  const handleProfileAccessVerify = async (e) => {
    e.preventDefault();
    setProfileAccessErr('');
    setProfilePwdMsg('');
    setProfilePwdErr('');

    const cleanId = (profileAccessId || '').trim().toLowerCase();
    if (!cleanId || !profileAccessPassword) {
      setProfileAccessErr('Please enter your ID and password.');
      return;
    }

    setProfileAccessLoading(true);
    try {
      const res = await verifySuperAdminProfileAccess({
        email: cleanId,
        password: profileAccessPassword
      });
      const verifiedEmail = res?.profile?.email || user?.email || cleanId;
      setProfileAccessVerified(true);
      setOldProfileEmail(verifiedEmail);
      setProfileEmail(verifiedEmail);
      setProfileAccessErr('');
    } catch (err) {
      setProfileAccessErr(err.message || 'Verification failed.');
      setProfileAccessVerified(false);
    } finally {
      setProfileAccessLoading(false);
    }
  };

  const handleProfilePasswordSubmit = (e) => {
    e.preventDefault();
    setProfilePwdErr('');
    setProfilePwdMsg('');
    if (!profileAccessVerified) {
      setProfilePwdErr('Please verify your ID and password first.');
      return;
    }

    const nextEmail = (profileEmail || '').trim().toLowerCase();
    const currentEmail = (oldProfileEmail || user?.email || '').trim().toLowerCase();
    const emailChanged = Boolean(nextEmail) && nextEmail !== currentEmail;
    const passwordChanged = Boolean(newAdminPassword || confirmAdminPassword);

    if (!emailChanged && !passwordChanged) {
      setProfilePwdErr('Update email and/or password before saving.');
      return;
    }
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setProfilePwdErr('Please enter a valid email address.');
      return;
    }
    if (passwordChanged) {
      if (!newAdminPassword || !confirmAdminPassword) {
        setProfilePwdErr('Please enter and confirm your new password.');
        return;
      }
      if (newAdminPassword.length < 8) {
        setProfilePwdErr('New password must be at least 8 characters.');
        return;
      }
      if (newAdminPassword !== confirmAdminPassword) {
        setProfilePwdErr('New password and confirm password do not match.');
        return;
      }
    }

    // Same DO-style confirm window before applying changes
    setProfileConfirmSummary({
      oldEmail: oldProfileEmail || user?.email || '-',
      newEmail: emailChanged ? nextEmail : (oldProfileEmail || user?.email || '-'),
      emailChanged,
      passwordChanged
    });
    setShowProfileConfirm(true);
  };

  const handleConfirmProfileUpdate = async () => {
    if (!profileConfirmSummary) return;

    setProfilePwdLoading(true);
    setProfilePwdErr('');
    try {
      const res = await changeSuperAdminPassword({
        currentPassword: profileAccessPassword,
        newPassword: profileConfirmSummary.passwordChanged ? newAdminPassword : undefined,
        email: profileConfirmSummary.emailChanged ? profileConfirmSummary.newEmail : undefined
      });
      if (res?.user && typeof onUserUpdate === 'function') {
        onUserUpdate(res.user);
      }
      setShowProfileConfirm(false);
      setProfileConfirmSummary(null);
      setProfilePwdMsg(res?.message || 'Profile updated successfully.');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      setProfileAccessPassword('');
      setProfileAccessVerified(false);
      setProfileAccessId(res?.user?.email || user?.email || '');
      setShowCurrentAdminPassword(false);
      setShowNewAdminPassword(false);
      setShowConfirmAdminPassword(false);
      setProfileEmail(res?.user?.email || user?.email || '');
      setOldProfileEmail(res?.user?.email || user?.email || '');
    } catch (err) {
      setShowProfileConfirm(false);
      setProfileConfirmSummary(null);
      setProfilePwdErr(err.message || 'Failed to update profile.');
    } finally {
      setProfilePwdLoading(false);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const clearPendingLogDeleteTimers = () => {
    if (pendingLogDeleteTimerRef.current) {
      clearTimeout(pendingLogDeleteTimerRef.current);
      pendingLogDeleteTimerRef.current = null;
    }
    if (pendingLogDeleteTickRef.current) {
      clearInterval(pendingLogDeleteTickRef.current);
      pendingLogDeleteTickRef.current = null;
    }
  };

  const restorePendingLogToUi = (pending) => {
    if (!pending?.log) return;
    const { type, id, log } = pending;
    if (type === 'daily') {
      setChamberLogs((prev) => (prev.some((r) => r.id === id) ? prev : [log, ...prev]));
    } else if (type === 'inward') {
      setInwardLogs((prev) => (prev.some((r) => r.inward_id === id) ? prev : [log, ...prev]));
    } else {
      setOutwardLogs((prev) => (prev.some((r) => r.outward_id === id) ? prev : [log, ...prev]));
    }
    setHistoryTotal((t) => (Number(t) || 0) + 1);
  };

  const commitPendingLogDelete = async (pending) => {
    if (!pending) return;
    try {
      if (pending.type === 'daily') await deleteChamberLog(pending.id);
      else if (pending.type === 'inward') await deleteInwardLog(pending.id);
      else await deleteOutwardLog(pending.id);
    } catch (err) {
      restorePendingLogToUi(pending);
      alert(err.message || 'Failed to delete log. It was restored to the list.');
    }
  };

  const finalizePendingLogDelete = async () => {
    const pending = pendingLogDeleteRef.current;
    clearPendingLogDeleteTimers();
    pendingLogDeleteRef.current = null;
    setPendingLogDelete(null);
    if (pending) await commitPendingLogDelete(pending);
  };

  const handleUndoLogDelete = () => {
    const pending = pendingLogDeleteRef.current;
    clearPendingLogDeleteTimers();
    pendingLogDeleteRef.current = null;
    setPendingLogDelete(null);
    if (!pending) return;
    restorePendingLogToUi(pending);
  };

  useEffect(() => {
    return () => {
      // If admin leaves while delete is pending, commit the delete
      const pendingLog = pendingLogDeleteRef.current;
      clearPendingLogDeleteTimers();
      if (pendingLog) {
        commitPendingLogDelete(pendingLog);
        pendingLogDeleteRef.current = null;
      }
      const pendingOp = pendingOperatorDeleteRef.current;
      clearPendingOperatorDeleteTimers();
      if (pendingOp) {
        commitPendingOperatorDelete(pendingOp);
        pendingOperatorDeleteRef.current = null;
      }
      const pendingCustomer = pendingCustomerDeleteRef.current;
      clearPendingCustomerDeleteTimers();
      if (pendingCustomer) {
        commitPendingCustomerDelete(pendingCustomer);
        pendingCustomerDeleteRef.current = null;
      }
      const pendingMaster = pendingMasterDeleteRef.current;
      clearPendingMasterDeleteTimers();
      if (pendingMaster) {
        commitPendingMasterDelete(pendingMaster);
        pendingMasterDeleteRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSaEditLog = (type, log) => {
    setSelectedDetailLog(null);
    setSaEditLog({ type, data: log });
  };

  const handleSaDeleteLog = async (type, log) => {
    const id = type === 'daily' ? log.id : type === 'inward' ? log.inward_id : log.outward_id;
    const ref = log.reference_no || `#${id}`;
    const kindLabel = type === 'daily' ? 'Chamber' : type === 'inward' ? 'Inward' : 'Outward';
    if (!window.confirm(`Delete this ${kindLabel} log (${ref})?\n\nYou can Undo for 30 seconds.`)) {
      return;
    }

    // If another delete is waiting, commit it first
    if (pendingOperatorDeleteRef.current) {
      await finalizePendingOperatorDelete();
    }
    if (pendingCustomerDeleteRef.current) {
      await finalizePendingCustomerDelete();
    }
    if (pendingMasterDeleteRef.current) {
      await finalizePendingMasterDelete();
    }
    if (pendingLogDeleteRef.current) {
      await finalizePendingLogDelete();
    }

    setSaLogActionBusy(true);
    try {
      const snapshot = { ...log };
      setSelectedDetailLog(null);
      if (saEditLog) setSaEditLog(null);
      if (searchedRecord) {
        const sid =
          searchedRecordType === 'daily'
            ? searchedRecord.id
            : searchedRecordType === 'inward'
              ? searchedRecord.inward_id
              : searchedRecord.outward_id;
        if (sid === id) {
          setSearchedRecord(null);
          setSearchedRecordType('');
        }
      }

      if (type === 'daily') setChamberLogs((prev) => prev.filter((r) => r.id !== id));
      else if (type === 'inward') setInwardLogs((prev) => prev.filter((r) => r.inward_id !== id));
      else setOutwardLogs((prev) => prev.filter((r) => r.outward_id !== id));

      setHistoryTotal((t) => Math.max(0, (Number(t) || 0) - 1));

      const pending = {
        type,
        id,
        log: snapshot,
        ref,
        kindLabel,
        secondsLeft: 30
      };
      pendingLogDeleteRef.current = pending;
      setPendingLogDelete(pending);

      pendingLogDeleteTickRef.current = setInterval(() => {
        setPendingLogDelete((prev) => {
          if (!prev) return null;
          const next = prev.secondsLeft - 1;
          if (next <= 0) return prev;
          return { ...prev, secondsLeft: next };
        });
      }, 1000);

      pendingLogDeleteTimerRef.current = setTimeout(() => {
        finalizePendingLogDelete();
      }, 30000);
    } finally {
      setSaLogActionBusy(false);
    }
  };

  const renderSaLogActions = (type, log) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => {
          setSelectedDetailLog(log);
          setDetailType(type);
          loadRecordAllowHistory(type, log);
        }}
        title="View Data Profile & Photos"
        style={{
          backgroundColor: '#f1f5f9',
          border: '1px solid #cbd5e1',
          color: '#334155',
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.75rem',
          fontWeight: 700
        }}
      >
        <Eye size={13} />
        <span>Details</span>
      </button>
      <button
        type="button"
        onClick={() => startSaEditLog(type, log)}
        title="Edit (Super Admin — no permission required)"
        disabled={saLogActionBusy}
        style={{
          backgroundColor: '#e0f2fe',
          border: '1px solid #bae6fd',
          color: '#0369a1',
          padding: '6px',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Edit size={14} />
      </button>
      <button
        type="button"
        className="btn-delete-log"
        onClick={() => handleSaDeleteLog(type, log)}
        title="Delete (Super Admin — no permission required)"
        disabled={saLogActionBusy}
        style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          padding: '6px',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  const hasPendingRequests = dashboardPendingRequests.length > 0;

  const clearSaEditLog = async () => {
    setSaEditLog(null);
    if (activeMenu === 'history_logs' || activeMenu === 'profile_lookup') {
      try {
        await loadHistoryLogs();
      } catch (_) {
        /* ignore */
      }
    }
  };

  const renderSaEditPanel = () => {
    if (!saEditLog) return null;
    const editType = saEditLog.type;
    return (
      <div className="sa-edit-log-panel">
        <div className="sa-edit-log-topbar">
          <button type="button" className="sa-edit-log-back" onClick={() => setSaEditLog(null)}>
            <X size={16} />
            Cancel Edit
          </button>
          <span className="sa-edit-log-badge">
            Super Admin direct edit · no permission required
          </span>
        </div>
        <div className="sa-edit-log-body">
          <Suspense
            fallback={
              <div className="page-lazy-loader" style={{ position: 'relative', minHeight: 280 }}>
                <div className="page-lazy-loader-inner">
                  <span className="page-lazy-loader-spinner" />
                  <span>Loading editor…</span>
                </div>
              </div>
            }
          >
            {editType === 'daily' && (
              <TempMonitor
                editData={saEditLog.data}
                setEditData={(d) => {
                  if (!d) clearSaEditLog();
                  else setSaEditLog({ type: 'daily', data: d });
                }}
                forcedMenu="All"
                onMenuChange={() => clearSaEditLog()}
              />
            )}
            {editType === 'inward' && (
              <InwardMonitor
                editData={saEditLog.data}
                setEditData={(d) => {
                  if (!d) clearSaEditLog();
                  else setSaEditLog({ type: 'inward', data: d });
                }}
                setActiveDOMenu={() => clearSaEditLog()}
              />
            )}
            {editType === 'outward' && (
              <OutwardMonitor
                editData={saEditLog.data}
                setEditData={(d) => {
                  if (!d) clearSaEditLog();
                  else setSaEditLog({ type: 'outward', data: d });
                }}
                setActiveDOMenu={() => clearSaEditLog()}
              />
            )}
          </Suspense>
        </div>
      </div>
    );
  };

  const isMainDataLoading =
    !saEditLog &&
    ((activeMenu === 'history_logs' && loadingLogs) ||
      (activeMenu === 'activity_logs' && loadingActivities) ||
      (activeMenu === 'data_operators' && !viewingOperator && loadingOps) ||
      (activeMenu === 'data_operators' && !!viewingOperator && (opMappingsLoading || opTaskLogsLoading)) ||
      (activeMenu === 'customers' && loadingSubAdmins) ||
      (activeMenu === 'customer_reports' && loadingCustomerReports) ||
      (activeMenu === 'daily_box_tracker' && (loadingDeltas || loadingMonthSheet)) ||
      (activeMenu === 'dashboard' && loadingPermRequests));

  return (
    <div className="app-container">
      {(savingOp || savingSubAdmin) && (
        <div className="account-save-overlay" role="status" aria-live="polite">
          <div className="account-save-overlay-card">
            <Loader2 size={28} className="spinner-icon" color="#00a2e8" />
            <strong>{savingOp ? (opProcessStatus || 'Processing…') : (subAdminProcessStatus || 'Processing…')}</strong>
            <span>Please wait — account save and email are in progress.</span>
          </div>
        </div>
      )}
      {isMainDataLoading && (
        <div className="sa-main-loading-overlay" role="status" aria-live="polite">
          <div className="sa-main-loading-card">
            <Loader2 size={36} className="spinner-icon" color="#0033a0" aria-hidden />
            <strong>Loading data…</strong>
            <span>Please wait while this section loads.</span>
          </div>
        </div>
      )}
      <style>{`
        @keyframes status-pulse {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }
        .pulsing-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #ef4444;
          animation: status-pulse 2s infinite;
        }
      `}</style>
      {/* 1. Secure Left Sidebar */}
      <aside className="do-sidebar desktop-only" style={{ padding: '20px 16px' }}>
        <div className="secure-sidebar-top">
          {/* Logo container */}
          <div className="secure-logo-container">
            <Logo />
          </div>





          {/* Super Admin Navigation Items */}
          <div className="secure-sidebar-nav" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              className={`clean-menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveMenu('dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'dashboard' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'dashboard' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LayoutDashboard size={18} />
                <span>Dashboard Overview</span>
              </div>
            </button>
            <button 
              className={`clean-menu-item ${activeMenu === 'data_operators' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('data_operators');
                setViewingOperator(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'data_operators' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'data_operators' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Thermometer size={18} />
                <span>Data Operators</span>
              </div>
            </button>
            <button 
              className={`clean-menu-item ${activeMenu === 'customers' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('customers');
                setViewingOperator(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'customers' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'customers' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={18} />
                <span>Customers</span>
              </div>
            </button>
            <button 
              className={`clean-menu-item ${activeMenu === 'master_data' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('master_data');
                setViewingOperator(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'master_data' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'master_data' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database size={18} />
                <span>Master Data</span>
              </div>
            </button>

            <button 
              className={`clean-menu-item ${activeMenu === 'customer_reports' ? 'active' : ''}`}
              onClick={() => setActiveMenu('customer_reports')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'customer_reports' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'customer_reports' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MessageSquareWarning size={18} />
                <span>Customer Reports</span>
              </div>
              {customerReports.some((r) => r && r.status === 'Open') && (
                <span className="pulsing-dot" />
              )}
            </button>

            <button 
              className={`clean-menu-item ${activeMenu === 'activity_logs' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('activity_logs');
                if (hasNewDOChanges) setAuditSubTab('do_changes');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'activity_logs' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'activity_logs' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={18} />
                <span>Operator Activities</span>
              </div>
              {(hasPendingRequests || hasNewDOChanges) && <span className="pulsing-dot" />}
            </button> 
            <button 
              className={`clean-menu-item ${activeMenu === 'history_logs' ? 'active' : ''}`}
              onClick={() => setActiveMenu('history_logs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'history_logs' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'history_logs' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History size={18} />
                <span>History Logs</span>
              </div>
            </button>
            <button 
              className={`clean-menu-item ${activeMenu === 'profile_lookup' ? 'active' : ''}`}
              onClick={() => setActiveMenu('profile_lookup')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'profile_lookup' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'profile_lookup' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Search size={18} />
                <span>Profile Lookup</span>
              </div>
            </button>


            <button 
              className={`clean-menu-item ${activeMenu === 'daily_box_tracker' ? 'active' : ''}`}
              onClick={() => setActiveMenu('daily_box_tracker')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeMenu === 'daily_box_tracker' ? 'var(--primary-light)' : 'transparent',
                color: activeMenu === 'daily_box_tracker' ? 'var(--primary)' : 'var(--text-dark)',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={18} />
                <span>Daily Box Tracker</span>
              </div>
            </button>
          </div>
        </div>

        {/* Sidebar Footer with Profile + Logout */}
        <div className="secure-sidebar-bottom">
          <div
            className={`secure-profile-badge secure-profile-badge--clickable${activeMenu === 'super_admin_profile' ? ' is-active' : ''}`}
            onClick={openSuperAdminProfileWindow}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openSuperAdminProfileWindow();
              }
            }}
            title="Open Super Admin Profile"
          >
            <div className="secure-avatar">SA</div>
            <div className="secure-user-info">
              <strong>Super Admin</strong>
              <span>{user?.email || 'admin@reeferon.com'}</span>
            </div>
            <button
              type="button"
              className="secure-logout-btn"
              onClick={(e) => {
                e.stopPropagation();
                onLogout();
              }}
              title="Log Out Session"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Workspace Layout */}
      {/* Header */}
      <header
        className="secure-admin-header"
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 24px', zIndex: 110 }}
      >
        {/* Left section: Mobile-only Logo */}
        <div className="secure-header-left" style={{ position: 'absolute', left: '24px', display: 'flex', alignItems: 'center' }}>
          <div className="secure-mobile-logo mobile-only">
            <Logo compact={true} />
          </div>
        </div>

        {/* Center section: Super Admin + date/time below */}
        <div className="secure-header-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', textAlign: 'center' }}>
          <span className="secure-role-tag" style={{ margin: 0 }}>
            Super Admin
          </span>
          <div className="secure-clock-subtext" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700' }}>
            <span>{formatDate(time)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={12} />
              {formatTime(time)}
            </span>
          </div>
        </div>

        {/* Right section: Mobile Hamburger Button & Spacers */}
        <div className="secure-header-right" style={{ position: 'absolute', right: '24px', display: 'flex', alignItems: 'center' }}>
          <button 
            className="mobile-hamburger-btn mobile-only"
            onClick={() => setIsMobileMenuOpen(prev => !prev)}
            aria-label="Toggle Navigation Menu"
            title="Open Menu"
          >
            {isMobileMenuOpen ? <X size={22} color="#00a2e8" /> : <Menu size={22} color="#0f172a" />}
          </button>
        </div>
      </header>

      {/* Backdrop Blur Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-backdrop-overlay mobile-only" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Right-Side Slide-In Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="mobile-right-drawer mobile-only">
          {/* Drawer Header */}
          <div className="right-drawer-header">
            <div
              className="drawer-user-info"
              role="button"
              tabIndex={0}
              onClick={() => {
                openSuperAdminProfileWindow();
                setIsMobileMenuOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openSuperAdminProfileWindow();
                  setIsMobileMenuOpen(false);
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Open Super Admin Profile"
            >
              <div className="user-avatar-circle">
                <User size={16} color="#00a2e8" />
              </div>
              <div className="user-text">
                <strong>Super Admin</strong>
                <span>{user?.email || 'admin@reeferon.com'}</span>
              </div>
            </div>
            <button className="right-drawer-close" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="right-drawer-section">Navigation</div>

          <div className="clean-menu-list">
            <button 
              className={`clean-menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('dashboard');
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <LayoutDashboard size={18} className="item-icon" />
                <span>Dashboard Overview</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>
             <button 
              className={`clean-menu-item ${activeMenu === 'data_operators' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('data_operators');
                setViewingOperator(null);
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <Thermometer size={18} className="item-icon" />
                <span>Data Operators</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>
             <button 
              className={`clean-menu-item ${activeMenu === 'customers' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('customers');
                setViewingOperator(null);
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <ShieldCheck size={18} className="item-icon" />
                <span>Customers</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>
            <button 
              className={`clean-menu-item ${activeMenu === 'master_data' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('master_data');
                setViewingOperator(null);
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <Database size={18} className="item-icon" />
                <span>Master Data</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeMenu === 'customer_reports' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('customer_reports');
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <MessageSquareWarning size={18} className="item-icon" />
                <span>Customer Reports</span>
                {customerReports.some((r) => r && r.status === 'Open') && (
                  <span className="pulsing-dot" style={{ marginLeft: '8px' }} />
                )}
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeMenu === 'activity_logs' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('activity_logs');
                if (hasNewDOChanges) setAuditSubTab('do_changes');
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <Activity size={18} className="item-icon" />
                <span>Operator Activities</span>
                {(hasPendingRequests || hasNewDOChanges) && <span className="pulsing-dot" style={{ marginLeft: '8px' }} />}
              </div>
             </button>

             <button 
              className={`clean-menu-item ${activeMenu === 'history_logs' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('history_logs');
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <History size={18} className="item-icon" />
                <span>History Logs</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className={`clean-menu-item ${activeMenu === 'profile_lookup' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('profile_lookup');
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <Search size={18} className="item-icon" />
                <span>Profile Lookup</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>





            <button 
              className={`clean-menu-item ${activeMenu === 'daily_box_tracker' ? 'active' : ''}`}
              onClick={() => {
                setActiveMenu('daily_box_tracker');
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="item-left">
                <Activity size={18} className="item-icon" />
                <span>Daily Box Tracker</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>

            <button 
              className="clean-menu-item"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onLogout();
              }}
              style={{ color: '#ef4444' }}
            >
              <div className="item-left">
                <LogOut size={18} className="item-icon" style={{ color: '#ef4444' }} />
                <span>Logout Session</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>
          </div>
        </div>
      )}

      {/* Body Content Viewport — sidebar stays visible; edit stays in this column only */}
      <main className="app-viewport secure-admin-viewport" style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        {saEditLog ? (
          renderSaEditPanel()
        ) : (
          <>
        {/* --- Menu: Super Admin Profile (email, password, mobile sub-admin registration) --- */}
        {activeMenu === 'super_admin_profile' && (
          <div className="sa-profile-window">
            <div className="sa-profile-window-top">
              <div className="sa-profile-window-title">
                <button
                  type="button"
                  className="sa-profile-back-ico"
                  onClick={() => {
                    clearProfilePasswordForm();
                    setActiveMenu('dashboard');
                  }}
                  title="Back to dashboard"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h2>Super Admin Profile</h2>
                  <p>Update login email and password from this working window.</p>
                </div>
              </div>
              <div className="sa-profile-window-actions">
                <span className="sa-profile-active-pill">
                  <CheckCircle2 size={14} />
                  Active
                </span>
                <button
                  type="button"
                  className="sa-profile-window-back"
                  onClick={() => {
                    clearProfilePasswordForm();
                    setActiveMenu('dashboard');
                  }}
                >
                  <X size={16} />
                  Close
                </button>
              </div>
            </div>

            <div className="sa-profile-window-grid">
              <div className="sa-profile-info-card">
                <div className="sa-profile-card-head">
                  <span className="sa-profile-card-ico">
                    <User size={16} />
                  </span>
                  <h3>Account Details</h3>
                </div>
                <div className="sa-profile-info-row">
                  <span>Role</span>
                  <strong>
                    <em className="sa-profile-role-pill">Super Admin</em>
                  </strong>
                </div>
                <div className="sa-profile-info-row">
                  <span>Email</span>
                  <strong>{user?.email || '—'}</strong>
                </div>
                <div className="sa-profile-info-row">
                  <span>Name</span>
                  <strong>{user?.full_name || 'Super Admin'}</strong>
                </div>
                <div className="sa-profile-info-note">
                  <Info size={14} />
                  <span>
                    Verify with your ID and password first. After verification you can update email,
                    password, or both.
                  </span>
                </div>
              </div>

              <div className="sa-profile-security-card">
                {!profileAccessVerified ? (
                  <div className="sa-profile-verify-layout">
                    <div className="sa-profile-verify-main">
                      <div className="sa-profile-card-head">
                        <span className="sa-profile-card-ico">
                          <ShieldCheck size={16} />
                        </span>
                        <div>
                          <h3>Profile Access Verification</h3>
                          <p className="sa-profile-security-sub">
                            Enter your Super Admin ID and password to continue.
                          </p>
                        </div>
                      </div>
                      <form className="sa-profile-form" onSubmit={handleProfileAccessVerify} autoComplete="off">
                        <label>Super Admin ID</label>
                        <div className="sa-profile-input-wrap has-lead">
                          <User size={15} className="sa-profile-input-lead" />
                          <input
                            type="email"
                            value={profileAccessId}
                            onChange={(e) => setProfileAccessId(e.target.value)}
                            placeholder="Enter your Super Admin ID"
                            autoComplete="off"
                            name="sa-profile-access-id"
                          />
                        </div>
                        <label>Password</label>
                        <div className="sa-profile-input-wrap has-lead">
                          <Lock size={15} className="sa-profile-input-lead" />
                          <input
                            type={showCurrentAdminPassword ? 'text' : 'password'}
                            value={profileAccessPassword}
                            onChange={(e) => setProfileAccessPassword(e.target.value)}
                            placeholder="Enter your password"
                            autoComplete="new-password"
                            name="sa-profile-access-password"
                          />
                          <button
                            type="button"
                            className="sa-profile-eye-btn"
                            onClick={() => setShowCurrentAdminPassword((p) => !p)}
                            title={showCurrentAdminPassword ? 'Hide Password' : 'Show Password'}
                          >
                            {showCurrentAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {profileAccessErr && <div className="sa-profile-error">{profileAccessErr}</div>}
                        <button type="submit" className="sa-profile-submit" disabled={profileAccessLoading}>
                          {profileAccessLoading ? (
                            <>
                              <Loader2 size={16} className="sa-profile-spin" />
                              Verifying…
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={16} />
                              Verify and Continue
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                    <aside className="sa-profile-secure-aside">
                      <span className="sa-profile-secure-badge">
                        <ShieldCheck size={22} />
                      </span>
                      <strong>Secure Access</strong>
                      <p>Only verified Super Admins can make changes to the system.</p>
                      <ul>
                        <li>
                          <CheckCircle2 size={14} /> ID Verification
                        </li>
                        <li>
                          <CheckCircle2 size={14} /> Password Verification
                        </li>
                        <li>
                          <CheckCircle2 size={14} /> Full Access
                        </li>
                      </ul>
                    </aside>
                  </div>
                ) : (
                  <>
                    <div className="sa-profile-card-head">
                      <span className="sa-profile-card-ico">
                        <Lock size={16} />
                      </span>
                      <div>
                        <h3>Update Email / Password</h3>
                        <p className="sa-profile-security-sub">
                          Update email, password, or both. Leave password fields blank if you only want
                          to change email.
                        </p>
                      </div>
                    </div>
                    <form className="sa-profile-form" onSubmit={handleProfilePasswordSubmit} autoComplete="off">
                      <div className="sa-profile-old-email">
                        <h2>Old Email ID</h2>
                        <h1>{oldProfileEmail || user?.email || '-'}</h1>
                      </div>
                      <label>New Email ID</label>
                      <div className="sa-profile-input-wrap has-lead">
                        <Mail size={15} className="sa-profile-input-lead" />
                        <input
                          type="email"
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          placeholder="Enter new email ID"
                          autoComplete="off"
                          name="sa-profile-new-email"
                        />
                      </div>
                      <label>New Password</label>
                      <div className="sa-profile-input-wrap has-lead">
                        <Lock size={15} className="sa-profile-input-lead" />
                        <input
                          type={showNewAdminPassword ? 'text' : 'password'}
                          value={newAdminPassword}
                          onChange={(e) => setNewAdminPassword(e.target.value)}
                          placeholder="Leave blank to keep current password"
                          autoComplete="new-password"
                          name="sa-profile-new-password"
                        />
                        <button
                          type="button"
                          className="sa-profile-eye-btn"
                          onClick={() => setShowNewAdminPassword((p) => !p)}
                          title={showNewAdminPassword ? 'Hide Password' : 'Show Password'}
                        >
                          {showNewAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <label>Confirm Password</label>
                      <div className="sa-profile-input-wrap has-lead">
                        <Lock size={15} className="sa-profile-input-lead" />
                        <input
                          type={showConfirmAdminPassword ? 'text' : 'password'}
                          value={confirmAdminPassword}
                          onChange={(e) => setConfirmAdminPassword(e.target.value)}
                          placeholder="Re-enter only if changing password"
                          autoComplete="new-password"
                          name="sa-profile-confirm-password"
                        />
                        <button
                          type="button"
                          className="sa-profile-eye-btn"
                          onClick={() => setShowConfirmAdminPassword((p) => !p)}
                          title={showConfirmAdminPassword ? 'Hide Password' : 'Show Password'}
                        >
                          {showConfirmAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>

                      {profilePwdErr && <div className="sa-profile-error">{profilePwdErr}</div>}
                      {profilePwdMsg && <div className="sa-profile-success">{profilePwdMsg}</div>}

                      <button type="submit" className="sa-profile-submit" disabled={profilePwdLoading}>
                        {profilePwdLoading ? (
                          <>
                            <Loader2 size={16} className="sa-profile-spin" />
                            Saving Changes…
                          </>
                        ) : (
                          <>
                            <Lock size={16} />
                            Save Profile Changes
                          </>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>

            <div className="sa-profile-subadmin-card">
              <div className="sa-profile-subadmin-body">
                <div className="sa-profile-subadmin-main">
                  <div className="sa-profile-card-head">
                    <span className="sa-profile-card-ico">
                      <Users size={16} />
                    </span>
                    <div>
                      <h3>Register Mobile Sub-Admin</h3>
                      <p className="sa-profile-security-sub">
                        Sub-Admins get full mobile app access (view and process all data). Separate from
                        Customers.
                      </p>
                    </div>
                  </div>

                  <form className="sa-profile-form sa-profile-form-wide" onSubmit={handleCreateAppSubAdmin} autoComplete="off">
                    <div className="sa-profile-subadmin-grid">
                      <div>
                        <label>Name *</label>
                        <div className="sa-profile-input-wrap has-lead">
                          <User size={15} className="sa-profile-input-lead" />
                          <input
                            type="text"
                            value={appSubFullName}
                            onChange={(e) => setAppSubFullName(e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''))}
                            placeholder="Full name"
                            name="app-sub-name"
                            autoComplete="off"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label>Number *</label>
                        <div className="sa-profile-input-wrap has-lead">
                          <Phone size={15} className="sa-profile-input-lead" />
                          <input
                            type="tel"
                            value={appSubPhone}
                            onChange={(e) => setAppSubPhone(e.target.value.replace(/[^\d+]/g, ''))}
                            placeholder="Phone number"
                            name="app-sub-phone"
                            autoComplete="off"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label>Email *</label>
                        <div className="sa-profile-input-wrap has-lead">
                          <Mail size={15} className="sa-profile-input-lead" />
                          <input
                            type="email"
                            value={appSubEmail}
                            onChange={(e) => setAppSubEmail(e.target.value)}
                            placeholder="subadmin@company.com"
                            name="app-sub-email"
                            autoComplete="off"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label>Password *</label>
                        <div className="sa-profile-input-wrap has-lead">
                          <Lock size={15} className="sa-profile-input-lead" />
                          <input
                            type={showAppSubPassword ? 'text' : 'password'}
                            value={appSubPassword}
                            onChange={(e) => setAppSubPassword(e.target.value)}
                            placeholder="Login password"
                            name="app-sub-password"
                            autoComplete="new-password"
                            required
                          />
                          <button
                            type="button"
                            className="sa-profile-eye-btn"
                            onClick={() => setShowAppSubPassword((p) => !p)}
                            title={showAppSubPassword ? 'Hide Password' : 'Show Password'}
                          >
                            {showAppSubPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {appSubAdminErr && <div className="sa-profile-error">{appSubAdminErr}</div>}
                    {appSubAdminMsg && <div className="sa-profile-success">{appSubAdminMsg}</div>}

                    <button type="submit" className="sa-profile-submit" disabled={appSubAdminSaving}>
                      {appSubAdminSaving ? (
                        <>
                          <Loader2 size={16} className="sa-profile-spin" />
                          Creating…
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} />
                          Create Sub-Admin
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <aside className="sa-profile-features-aside">
                  <span className="sa-profile-secure-badge">
                    <Smartphone size={22} />
                  </span>
                  <strong>Sub-Admin Features</strong>
                  <ul>
                    <li>
                      <CheckCircle2 size={14} /> Access to mobile application
                    </li>
                    <li>
                      <CheckCircle2 size={14} /> View and process all data
                    </li>
                    <li>
                      <CheckCircle2 size={14} /> Separate access from Customers
                    </li>
                    <li>
                      <CheckCircle2 size={14} /> Can be deactivated anytime
                    </li>
                  </ul>
                </aside>
              </div>
            </div>

            <div className="sa-profile-list-card">
              <div className="sa-profile-list-head">
                <div className="sa-profile-card-head">
                  <span className="sa-profile-card-ico">
                    <Users size={16} />
                  </span>
                  <div>
                    <h3>Registered Sub-Admins</h3>
                    <p className="sa-profile-security-sub">Manage existing sub-admins and their access.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="sa-profile-refresh-btn"
                  onClick={loadAppSubAdminsList}
                  disabled={appSubAdminLoading}
                  title="Refresh list"
                >
                  <RefreshCw size={14} className={appSubAdminLoading ? 'sa-profile-spin' : ''} />
                  Refresh
                </button>
              </div>

              {appSubAdminErr && <div className="sa-profile-error">{appSubAdminErr}</div>}
              {appSubAdminLoading ? (
                <p className="sa-profile-security-sub">Loading…</p>
              ) : appSubAdmins.length === 0 && !appSubAdminErr ? (
                <p className="sa-profile-security-sub">No Sub-Admins yet.</p>
              ) : appSubAdmins.length === 0 ? null : (
                <div className="sa-profile-table-wrap">
                  <table className="sa-profile-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Number</th>
                        <th>Email</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appSubAdmins.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.full_name || '—'}</strong>
                          </td>
                          <td>{row.phone_no || '—'}</td>
                          <td>{row.email}</td>
                          <td>
                            <button
                              type="button"
                              className="sa-profile-delete-btn"
                              onClick={() => handleDeleteAppSubAdmin(row.id)}
                            >
                              <Trash2 size={13} />
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {showProfileConfirm && profileConfirmSummary && (
              <div className="sa-profile-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="sa-profile-confirm-title">
                <div className="sa-profile-confirm-content">
                  <div className="sa-profile-confirm-header">
                    <h3 id="sa-profile-confirm-title" className="sa-profile-confirm-title">
                      <CheckCircle size={20} color="#10b981" />
                      <span>Verify Profile Update</span>
                    </h3>
                  </div>

                  <div className="sa-profile-confirm-body">
                    <div className="sa-profile-confirm-box">
                      <h4>Change Summary</h4>

                      <div className="sa-profile-confirm-row">
                        <div className="sa-profile-confirm-item">
                          <span className="sa-profile-confirm-label">Current Email</span>
                          <strong>{profileConfirmSummary.oldEmail}</strong>
                        </div>
                        <div className="sa-profile-confirm-divider">→</div>
                        <div className="sa-profile-confirm-item">
                          <span className="sa-profile-confirm-label">
                            {profileConfirmSummary.emailChanged ? 'New Email' : 'Email (unchanged)'}
                          </span>
                          <strong>{profileConfirmSummary.newEmail}</strong>
                        </div>
                      </div>

                      <div className="sa-profile-confirm-flags">
                        <div className="sa-profile-confirm-flag">
                          <span>Email update</span>
                          <strong className={profileConfirmSummary.emailChanged ? 'is-yes' : 'is-no'}>
                            {profileConfirmSummary.emailChanged ? 'Yes' : 'No'}
                          </strong>
                        </div>
                        <div className="sa-profile-confirm-flag">
                          <span>Password update</span>
                          <strong className={profileConfirmSummary.passwordChanged ? 'is-yes' : 'is-no'}>
                            {profileConfirmSummary.passwordChanged ? 'Yes' : 'No'}
                          </strong>
                        </div>
                      </div>

                      <div className="sa-profile-confirm-banner">
                        Confirm to apply these Super Admin login changes. You may need to sign in again with the new credentials.
                      </div>
                    </div>
                  </div>

                  <div className="sa-profile-confirm-actions">
                    <button
                      type="button"
                      className="sa-profile-confirm-cancel"
                      onClick={() => {
                        setShowProfileConfirm(false);
                        setProfileConfirmSummary(null);
                      }}
                      disabled={profilePwdLoading}
                    >
                      <span>Back to Edit Form</span>
                    </button>
                    <button
                      type="button"
                      className="sa-profile-confirm-save"
                      onClick={handleConfirmProfileUpdate}
                      disabled={profilePwdLoading}
                    >
                      {profilePwdLoading ? (
                        <>
                          <Loader2 size={16} className="sa-profile-spin" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        <span>Confirm & Save</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- Menu: Dashboard (stats, DO tasks, permission queue, quick actions) --- */}
        {/* Undo new UI: set USE_NEW_SA_DASHBOARD = false in dashboard/saDashboardUi.js */}
        {activeMenu === 'dashboard' && USE_NEW_SA_DASHBOARD ? (
          <SaDashboardControlCenter
            operators={operators}
            warehousesList={warehousesList}
            customers={subAdmins}
            dashboardPendingRequests={dashboardPendingRequests}
            hasPendingRequests={hasPendingRequests}
            hasNewDOChanges={hasNewDOChanges}
            doTaskOverview={doTaskOverview}
            doTaskSummary={doTaskSummary}
            doTaskRows={doTaskRows}
            doTaskFromDate={doTaskFromDate}
            setDoTaskFromDate={setDoTaskFromDate}
            doTaskToDate={doTaskToDate}
            setDoTaskToDate={setDoTaskToDate}
            doTaskFilter={doTaskFilter}
            setDoTaskFilter={setDoTaskFilter}
            doTaskSearch={doTaskSearch}
            setDoTaskSearch={setDoTaskSearch}
            loadingDoTasks={loadingDoTasks}
            doTaskError={doTaskError}
            setDoTaskError={setDoTaskError}
            loadDoTaskOverview={loadDoTaskOverview}
            openDoFromDashboard={openDoFromDashboard}
            openDataOperatorsHome={openDataOperatorsHome}
            setActiveMenu={setActiveMenu}
            setAuditSubTab={setAuditSubTab}
            localDateStr={localDateStr}
          />
        ) : null}
        {activeMenu === 'dashboard' && !USE_NEW_SA_DASHBOARD && (
          <div className="sa-op-gmail sa-dash">
            <section className="sa-op-card">
              <div className="sa-op-dir-toolbar">
                <div className="sa-dash-welcome">
                  <span className="sa-op-avatar sa-dash-avatar">
                    <ShieldCheck size={14} />
                  </span>
                  <div>
                    <h2 className="sa-op-title">Control Center Dashboard</h2>
                    <p className="sa-op-sub">
                      Super Admin overview of operators, daily chamber tasks, warehouses and activity
                    </p>
                  </div>
                </div>
                <div className="sa-dash-online">
                  <span className="sa-dash-online-dot" />
                  System monitoring online
                </div>
              </div>

              <div className="sa-dash-stats">
                <button
                  type="button"
                  className="sa-dash-stat"
                  onClick={openDataOperatorsHome}
                >
                  <span className="sa-dash-stat-top">
                    <em>Operators</em>
                    <User size={14} />
                  </span>
                  <strong>{operators.length}</strong>
                  <span>Registered Data Operators</span>
                </button>
                <div className="sa-dash-stat">
                  <span className="sa-dash-stat-top">
                    <em>Warehouses</em>
                    <Database size={14} />
                  </span>
                  <strong>{warehousesList.length}</strong>
                  <span>Locations Managed</span>
                </div>
                <button
                  type="button"
                  className="sa-dash-stat"
                  onClick={() => setActiveMenu('customers')}
                >
                  <span className="sa-dash-stat-top">
                    <em>Customers</em>
                    <ShieldCheck size={14} />
                  </span>
                  <strong>{subAdmins.length}</strong>
                  <span>Registered Customers</span>
                </button>
                {hasPendingRequests ? (
                  <button
                    type="button"
                    className="sa-dash-stat alert"
                    onClick={() => {
                      setActiveMenu('activity_logs');
                      setAuditSubTab('permission_log');
                    }}
                  >
                    <span className="sa-dash-stat-top">
                      <em>Permissions</em>
                      <Lock size={14} />
                    </span>
                    <strong>{dashboardPendingRequests.length}</strong>
                    <span>Pending Role Requests</span>
                  </button>
                ) : null}
              </div>
            </section>

            <section className="sa-op-card">
              <div className="sa-op-dir-toolbar">
                <div>
                  <h2 className="sa-op-title">Operational Shortcuts</h2>
                  <p className="sa-op-sub">Jump to common Super Admin actions</p>
                </div>
              </div>
              <div className="sa-dash-shortcuts">
                <button
                  type="button"
                  className="sa-dash-shortcut"
                  onClick={openDataOperatorsHome}
                >
                  <UserPlus size={14} />
                  <span>Register Operator</span>
                </button>
                <button
                  type="button"
                  className={`sa-dash-shortcut${hasPendingRequests ? ' alert' : ''}`}
                  onClick={() => {
                    setActiveMenu('activity_logs');
                    setAuditSubTab('permission_log');
                  }}
                >
                  <Lock size={14} />
                  <span>Permission Requests</span>
                  {hasPendingRequests ? <span className="pulsing-dot" style={{ position: 'relative', top: 'auto', right: 'auto' }} /> : null}
                </button>
                <button
                  type="button"
                  className={`sa-dash-shortcut${hasNewDOChanges ? ' alert' : ''}`}
                  onClick={() => {
                    setActiveMenu('activity_logs');
                    setAuditSubTab('do_changes');
                  }}
                >
                  <Activity size={14} />
                  <span>DO Operations Log</span>
                  {hasNewDOChanges ? <span className="pulsing-dot" style={{ position: 'relative', top: 'auto', right: 'auto' }} /> : null}
                </button>
                <button
                  type="button"
                  className="sa-dash-shortcut"
                  onClick={() => setActiveMenu('history_logs')}
                >
                  <History size={14} />
                  <span>System Logs</span>
                </button>
                <button
                  type="button"
                  className="sa-dash-shortcut"
                  onClick={() => setActiveMenu('profile_lookup')}
                >
                  <Search size={14} />
                  <span>Profile Lookup</span>
                </button>
                <button
                  type="button"
                  className="sa-dash-shortcut"
                  onClick={() => setActiveMenu('customer_reports')}
                >
                  <MessageSquareWarning size={14} />
                  <span>Customer Reports</span>
                </button>
              </div>
            </section>

            <section className="sa-op-card sa-dash-tasks">
              <div className="sa-dash-task-head">
                <div className="sa-dash-task-head-left">
                  <span className="sa-dash-task-icon">
                    <ClipboardCheck size={15} />
                  </span>
                  <div className="sa-dash-task-titles">
                    <strong>DO tasks</strong>
                    <span>
                      {(() => {
                        const from = doTaskOverview?.fromDate || doTaskFromDate || localDateStr();
                        const to = doTaskOverview?.toDate || doTaskToDate || from;
                        const fmt = (ymd) =>
                          new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          });
                        if (from === to && from === localDateStr()) return 'Today';
                        if (from === to) return fmt(from);
                        return `${fmt(from)} → ${fmt(to)}`;
                      })()}
                      {' · Morning + Evening'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="sa-op-btn-text"
                  onClick={() =>
                    loadDoTaskOverview({ fromDate: doTaskFromDate, toDate: doTaskToDate })
                  }
                  disabled={loadingDoTasks}
                >
                  {loadingDoTasks ? <Loader2 size={12} className="sa-spin" /> : null}
                  {loadingDoTasks ? 'Loading' : 'Refresh'}
                </button>
              </div>

              <div className="sa-dash-task-tools">
                <label className="sa-dash-task-date-wrap" title="From date">
                  <Calendar size={13} />
                  <input
                    className="sa-op-filter sa-dash-task-date"
                    type="date"
                    value={doTaskFromDate || ''}
                    max={doTaskToDate || localDateStr()}
                    onChange={(e) => {
                      const val = e.target.value || localDateStr();
                      setDoTaskFromDate(val);
                      if (doTaskToDate && val > doTaskToDate) setDoTaskToDate(val);
                    }}
                    aria-label="DO tasks from date"
                  />
                </label>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>→</span>
                <label className="sa-dash-task-date-wrap" title="To date">
                  <input
                    className="sa-op-filter sa-dash-task-date"
                    type="date"
                    value={doTaskToDate || ''}
                    min={doTaskFromDate || undefined}
                    max={localDateStr()}
                    onChange={(e) => {
                      const val = e.target.value || localDateStr();
                      setDoTaskToDate(val);
                      if (doTaskFromDate && val < doTaskFromDate) setDoTaskFromDate(val);
                    }}
                    aria-label="DO tasks to date"
                  />
                </label>
                <button
                  type="button"
                  className="sa-dash-task-today-btn"
                  onClick={() =>
                    loadDoTaskOverview({ fromDate: doTaskFromDate, toDate: doTaskToDate })
                  }
                  disabled={loadingDoTasks || !doTaskFromDate || !doTaskToDate}
                >
                  Apply
                </button>
                {!(doTaskFromDate === localDateStr() && doTaskToDate === localDateStr()) ? (
                  <button
                    type="button"
                    className="sa-dash-task-today-btn"
                    onClick={() => {
                      const today = localDateStr();
                      setDoTaskFromDate(today);
                      setDoTaskToDate(today);
                      loadDoTaskOverview({ fromDate: today, toDate: today });
                    }}
                    disabled={loadingDoTasks}
                  >
                    Today
                  </button>
                ) : null}
                <div className="sa-dash-task-filters">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'overdue', label: 'Overdue' },
                    { id: 'done', label: 'Done' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`sa-dash-task-filter${doTaskFilter === tab.id ? ' active' : ''}`}
                      onClick={() => setDoTaskFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <label className="sa-dash-task-search">
                  <Search size={13} />
                  <input
                    type="search"
                    value={doTaskSearch}
                    onChange={(e) => setDoTaskSearch(e.target.value)}
                    placeholder="Search DO or warehouse"
                  />
                </label>
              </div>

              <div className="sa-dash-task-metrics">
                <div className="sa-dash-task-metric done" title="Morning completed / expected">
                  <span>Morning</span>
                  <strong>
                    {Number(doTaskSummary.morning_completed) || 0}
                    <i>/{Number(doTaskSummary.morning_expected) || 0}</i>
                  </strong>
                </div>
                <div className="sa-dash-task-metric evening" title="Evening completed / expected">
                  <span>Evening</span>
                  <strong>
                    {Number(doTaskSummary.evening_completed) || 0}
                    <i>/{Number(doTaskSummary.evening_expected) || 0}</i>
                  </strong>
                </div>
                <div className="sa-dash-task-metric overdue" title="Missing logs in prior 5 days">
                  <span>Overdue</span>
                  <strong>{Number(doTaskSummary.overdue) || 0}</strong>
                </div>
              </div>

              <div className="sa-dash-task-metrics sa-dash-task-metrics-io" title="Inward / Outward log counts from database">
                <div className="sa-dash-task-metric inward" title="All inward records till now (all DOs)">
                  <span>Total Inward</span>
                  <strong>{Number(doTaskSummary.total_inward) || 0}</strong>
                </div>
                <div className="sa-dash-task-metric outward" title="All outward records till now (all DOs)">
                  <span>Total Outward</span>
                  <strong>{Number(doTaskSummary.total_outward) || 0}</strong>
                </div>
                <div className="sa-dash-task-metric inward-today" title={`Inward ${doTaskFromDate || '—'} → ${doTaskToDate || '—'} (all DOs)`}>
                  <span>
                    {doTaskFromDate === doTaskToDate && doTaskFromDate === localDateStr()
                      ? 'Today Inward'
                      : doTaskFromDate === doTaskToDate
                        ? 'Day Inward'
                        : 'Period Inward'}
                  </span>
                  <strong>{Number(doTaskSummary.today_inward) || 0}</strong>
                </div>
                <div className="sa-dash-task-metric outward-today" title={`Outward ${doTaskFromDate || '—'} → ${doTaskToDate || '—'} (all DOs)`}>
                  <span>
                    {doTaskFromDate === doTaskToDate && doTaskFromDate === localDateStr()
                      ? 'Today Outward'
                      : doTaskFromDate === doTaskToDate
                        ? 'Day Outward'
                        : 'Period Outward'}
                  </span>
                  <strong>{Number(doTaskSummary.today_outward) || 0}</strong>
                </div>
              </div>

              {doTaskError ? (
                <div className="sa-op-banner-wrap">
                  <LoadErrorBanner
                    message={doTaskError}
                    onRetry={() =>
                      loadDoTaskOverview({ fromDate: doTaskFromDate, toDate: doTaskToDate })
                    }
                    onDismiss={() => setDoTaskError('')}
                  />
                </div>
              ) : null}

              {loadingDoTasks && !doTaskOverview ? (
                <div className="sa-dash-task-empty">Loading DO tasks…</div>
              ) : doTaskRows.length === 0 ? (
                <div className="sa-dash-task-empty">
                  {doTaskSearch || doTaskFilter !== 'all'
                    ? 'No operators match this filter.'
                    : 'No data operators yet.'}
                </div>
              ) : (
                <div className="sa-dash-task-list">
                  {!(Number(doTaskSummary.morning_completed) || Number(doTaskSummary.evening_completed)) ? (
                    <div className="sa-dash-task-hint">
                      No submissions in this date range. Adjust From / To and Apply to see completed Morning / Evening counts.
                    </div>
                  ) : null}
                  <table className="sa-dash-task-table">
                    <thead>
                      <tr>
                        <th className="sa-dash-task-th-status" aria-label="Status" />
                        <th>Operator</th>
                        <th>Warehouse</th>
                        <th>Morning</th>
                        <th>Evening</th>
                        <th>Overdue</th>
                        <th title={`Inward ${doTaskFromDate || '—'} → ${doTaskToDate || '—'}`}>
                          {doTaskFromDate === doTaskToDate && doTaskFromDate === localDateStr()
                            ? 'Today In'
                            : doTaskFromDate === doTaskToDate
                              ? 'Day In'
                              : 'Period In'}
                        </th>
                        <th title={`Outward ${doTaskFromDate || '—'} → ${doTaskToDate || '—'}`}>
                          {doTaskFromDate === doTaskToDate && doTaskFromDate === localDateStr()
                            ? 'Today Out'
                            : doTaskFromDate === doTaskToDate
                              ? 'Day Out'
                              : 'Period Out'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {doTaskRows.map((op, idx) => {
                        const totalTasks = Number(op.assignment_count) || 0;
                        const mornExp = Number(op.morning_expected) || totalTasks;
                        const eveExp = Number(op.evening_expected) || totalTasks;
                        const mornDone = Number(op.morning_completed) || 0;
                        const eveDone = Number(op.evening_completed) || 0;
                        const overdue = Number(op.overdue) || 0;
                        const mornPend = Number(op.morning_pending) || Math.max(0, mornExp - mornDone);
                        const evePend = Number(op.evening_pending) || Math.max(0, eveExp - eveDone);
                        const mornPct = mornExp > 0 ? Math.min(100, Math.round((mornDone / mornExp) * 100)) : 0;
                        const evePct = eveExp > 0 ? Math.min(100, Math.round((eveDone / eveExp) * 100)) : 0;
                        const inToday = Number(op.today_inward) || 0;
                        const outToday = Number(op.today_outward) || 0;
                        const dayLabel =
                          doTaskFromDate === doTaskToDate
                            ? doTaskFromDate || 'selected day'
                            : `${doTaskFromDate || '—'} → ${doTaskToDate || '—'}`;
                        const tone =
                          overdue > 0
                            ? 'bad'
                            : mornPend > 0 || evePend > 0
                              ? 'warn'
                              : mornExp + eveExp > 0
                                ? 'good'
                                : 'muted';
                        return (
                          <tr
                            key={`${op.id || op.email || op.name}-${idx}`}
                            className={`sa-dash-task-row tone-${tone}`}
                            onClick={() => openDoFromDashboard(op)}
                            title={`${op.name || op.full_name || 'DO'} · Inward ${inToday} · Outward ${outToday} on ${dayLabel}`}
                          >
                            <td className="sa-dash-task-td-status">
                              <span className="sa-dash-task-dot" />
                            </td>
                            <td className="sa-dash-task-td-name">
                              <strong>{op.name || op.full_name || 'DO'}</strong>
                            </td>
                            <td className="sa-dash-task-td-wh">{op.warehouse_name || '—'}</td>
                            <td
                              className={`sa-dash-task-td-shift${mornPend > 0 ? ' pending' : mornExp > 0 ? ' done' : ''}`}
                            >
                              <span className="sa-dash-task-shift-top">
                                <b>{mornDone}</b>
                                <i>/{mornExp}</i>
                              </span>
                              <span className="sa-dash-task-bar" aria-hidden>
                                <span style={{ width: `${mornPct}%` }} />
                              </span>
                            </td>
                            <td
                              className={`sa-dash-task-td-shift${evePend > 0 ? ' pending' : eveExp > 0 ? ' done' : ''}`}
                            >
                              <span className="sa-dash-task-shift-top">
                                <b>{eveDone}</b>
                                <i>/{eveExp}</i>
                              </span>
                              <span className="sa-dash-task-bar" aria-hidden>
                                <span style={{ width: `${evePct}%` }} />
                              </span>
                            </td>
                            <td className={`sa-dash-task-td-overdue${overdue > 0 ? ' hot' : ''}`}>{overdue}</td>
                            <td className="sa-dash-task-td-io inward" title={`Inward on ${dayLabel}`}>
                              <b>{inToday}</b>
                            </td>
                            <td className="sa-dash-task-td-io outward" title={`Outward on ${dayLabel}`}>
                              <b>{outToday}</b>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {hasPendingRequests ? (
            <section className="sa-op-card sa-dash-perm alert">
              <div className="sa-op-dir-toolbar">
                <div>
                  <h2 className="sa-op-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    Role &amp; Permission Requests
                    <span className="pulsing-dot" style={{ position: 'relative', top: 'auto', right: 'auto' }} />
                  </h2>
                  <p className="sa-op-sub">
                    {dashboardPendingRequests.length} pending — approve or deny directly from dashboard
                  </p>
                </div>
                <div className="sa-op-dir-tools">
                  <button
                    type="button"
                    className="sa-op-btn-text"
                    onClick={() => loadPermissionRequests()}
                    disabled={loadingPermRequests}
                  >
                    {loadingPermRequests ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <button
                    type="button"
                    className="sa-op-btn-text"
                    onClick={() => {
                      setActiveMenu('activity_logs');
                      setAuditSubTab('permission_log');
                    }}
                  >
                    Open full log
                  </button>
                </div>
              </div>

              {activeMenu === 'dashboard' && logsError ? (
                <div className="sa-op-banner-wrap">
                  <LoadErrorBanner
                    message={logsError}
                    onRetry={loadPermissionRequests}
                    onDismiss={() => setLogsError('')}
                  />
                </div>
              ) : null}

              {activeMenu === 'dashboard' && opSuccess ? (
                <div className="sa-op-banner success">{opSuccess}</div>
              ) : null}

              <div className="sa-dash-perm-list">
                {dashboardPendingRequests.map((pr) => {
                    if (!pr) return null;
                    const parsed = parseRequestDescription(pr.description || pr.request_description, pr.record_type);
                    const isMasterSetup = pr.record_type === 'MasterSetup';
                    const isChamberMaster = pr.record_type === 'ChamberMaster';
                    const isChamberType = pr.record_type === 'ChamberType' || parsed.refNo === 'TYPE';
                    const isClientMaster = pr.record_type === 'ClientMaster';
                    const isAllowStyle = isMasterSetup || isChamberMaster || isChamberType || isClientMaster;
                    const warehouse = operatorWarehouseMap[pr.operator_email ? pr.operator_email.toLowerCase() : ''] || 'System / Admin';
                    const requestType = isMasterSetup
                      ? 'OPEN'
                      : isChamberType
                        ? 'TYPE'
                        : isChamberMaster
                          ? (parsed.refNo || 'ALLOW')
                          : (pr.raw_action === 'REQUEST_DELETE' ? 'DELETE' : 'EDIT');
                    return (
                      <div key={pr.id} className="sa-dash-perm-row">
                        <div className="sa-dash-perm-main">
                          <span className="sa-op-avatar">{String(pr.operator_email || 'DO').slice(0, 2).toUpperCase()}</span>
                          <div className="sa-dash-perm-copy">
                            <strong>{renderOperatorEmail(pr.operator_email)}</strong>
                            <em>
                              {parsed.module}
                              {' · '}
                              {warehouse}
                              {' · '}
                              {requestType}
                            </em>
                            <span className="sa-dash-perm-desc">
                              {parsed.client !== '-' ? `${parsed.client} · ` : ''}
                              {(pr.description || '').split(' | ')[0] || 'Permission request'}
                            </span>
                            {(pr.remark || pr.request_remark) ? (
                              <span className="sa-dash-perm-remark">
                                <strong>Remark</strong>
                                {String(pr.remark || pr.request_remark).trim()}
                              </span>
                            ) : null}
                            {parsed.extra !== '-' ? (
                              <span className="sa-dash-perm-extra">{parsed.extra}</span>
                            ) : null}
                          </div>
                          {!isAllowStyle && parsed.refNo ? (
                            <button
                              type="button"
                              className="sa-op-btn-text"
                              onClick={() => showLogDetailsByRef(parsed.refNo, pr.record_id, parsed.module)}
                            >
                              View log
                            </button>
                          ) : null}
                        </div>
                        <div className="sa-dash-perm-actions">
                          <button
                            type="button"
                            className="sa-op-btn-primary"
                            onClick={() => handleApproveDenyPermission(pr.id, 'Approved')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="sa-op-btn-text danger"
                            onClick={() => openDenyPermissionModal(pr)}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
            ) : null}
          </div>
        )}







        {/* --- Menu: Inventory reconciliation (warehouse stock vs log deltas) --- */}
        {activeMenu === 'inventory_log' && (
          <div className="diagnostics-card" style={{ padding: '24px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {inventorySubView === 'breakdown' ? (
              (() => {
                const clientMap = {};
                const filtered = inventoryLogs.filter(row => {
                  if (inventoryWarehouseFilter !== 'All' && row.warehouse_name !== inventoryWarehouseFilter) {
                    return false;
                  }
                  return true;
                });

                filtered.forEach(row => {
                  if (!row.client_name) return;
                  const client = row.client_name;
                  if (!clientMap[client]) {
                    clientMap[client] = {
                      clientName: client,
                      chambers: new Set(),
                      bookBalance: 0,
                      physicalBoxes: 0,
                      warehouseName: row.warehouse_name || '-'
                    };
                  }
                  if (row.chamber_name) clientMap[client].chambers.add(row.chamber_name);
                  clientMap[client].bookBalance += parseInt(row.calculated_balance, 10) || 0;
                  clientMap[client].physicalBoxes += parseInt(row.physical_audit_count, 10) || 0;
                });

                const breakdownList = Object.values(clientMap).map(item => ({
                  ...item,
                  chambersList: Array.from(item.chambers).join(', ') || '-'
                }));

                const totalBreakdownItems = breakdownList.length;
                const indexOfLastItem = breakdownCurrentPage * breakdownPerPage;
                const indexOfFirstItem = indexOfLastItem - breakdownPerPage;
                const currentBreakdownItems = breakdownList.slice(indexOfFirstItem, indexOfLastItem);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          onClick={() => setInventorySubView('main')}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-main)',
                            color: 'var(--text-dark)',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          ← Back
                        </button>
                        <div>
                          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-dark)' }}>
                            Client Box Inventory Breakdown
                          </h2>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                            Warehouse: {inventoryWarehouseFilter === 'All' ? 'All Warehouses' : inventoryWarehouseFilter}
                          </p>
                        </div>
                      </div>

                      {/* Export CSV */}
                      <button
                        onClick={() => {
                          if (breakdownList.length === 0) {
                            alert('No data to export.');
                            return;
                          }
                          const headers = 'Client Name,Warehouse Name,Active Chambers,Book Balance,Physical Floor Box Count\n';
                          const csvContent = headers + breakdownList.map(row => {
                            return `"${row.clientName || '-'}","${row.warehouseName || '-'}","${row.chambersList || '-'}",${row.bookBalance},${row.physicalBoxes}`;
                          }).join('\n');
                          downloadCsv(`Client_Box_Breakdown_${inventoryWarehouseFilter}_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          backgroundColor: 'var(--primary)',
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Download size={14} />
                        Export Breakdown CSV
                      </button>
                    </div>

                    {/* Table */}
                    {currentBreakdownItems.length === 0 ? (
                      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <span>No client stock records found.</span>
                      </div>
                    ) : (
                      <>
                        <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                          <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Client Name</th>
                                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Warehouse</th>
                                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Active Chambers</th>
                                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Book Balance</th>
                                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Physical Boxes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentBreakdownItems.map((client, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '12px 16px', fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>{client.clientName}</td>
                                  <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.warehouseName}</td>
                                  <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{client.chambersList}</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-dark)' }}>{client.bookBalance.toLocaleString()}</td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.82rem', fontWeight: '800', color: 'var(--primary)' }}>{client.physicalBoxes.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination Bar */}
                        <PaginationBar
                          page={breakdownCurrentPage}
                          totalItems={totalBreakdownItems}
                          pageSize={breakdownPerPage}
                          onPageChange={setBreakdownCurrentPage}
                          itemLabel="clients"
                        />
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              // Main Stock Reconciliation Page
              <>
                {/* Header section */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-dark)' }}>
                      Inventory Stock Reconciliation
                    </h2>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                      Reconcile paper stock balances (Inward - Outward) with daily physical floor counts.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={loadInventoryReconciliationData}
                      disabled={loadingInventory}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-main)',
                        color: 'var(--text-dark)',
                        fontWeight: '700',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Activity size={14} className={loadingInventory ? 'spin' : ''} />
                      Refresh
                    </button>
                    <button
                      onClick={() => {
                        if (inventoryLogs.length === 0) {
                          alert('No data to export.');
                          return;
                        }
                        const headers = 'Client Name,Warehouse Name,Total Inward Boxes,Total Outward Boxes,Book Balance,Physical Audit Count,Last Audit Date,Chamber Name,Discrepancy/Variance\n';
                        const csvContent = headers + inventoryLogs.map(row => {
                          const auditDate = row.last_audit_date ? new Date(row.last_audit_date).toLocaleDateString('en-GB') : '-';
                          return `"${row.client_name || '-'}","${row.warehouse_name || '-'}",${row.total_inward_boxes},${row.total_outward_boxes},${row.calculated_balance},${row.physical_audit_count},"${auditDate}","${row.chamber_name || '-'}",${row.discrepancy}`;
                        }).join('\n');
                        downloadCsv(`ReeferON_InventoryReconciliation_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        backgroundColor: 'var(--primary)',
                        color: '#ffffff',
                        fontWeight: '700',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Download size={14} />
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Error Banner */}
                {inventoryError && (
                  <LoadErrorBanner
                    message={inventoryError}
                    onRetry={loadInventoryReconciliationData}
                    onDismiss={() => setInventoryError('')}
                  />
                )}

                {(() => {
                  const uniqueClients = new Set(inventoryLogs.map(row => row.client_name).filter(Boolean)).size;
                  const uniqueChambers = new Set(inventoryLogs.map(row => row.chamber_name).filter(Boolean)).size;
                  const totalBoxes = inventoryLogs.reduce((sum, row) => sum + (parseInt(row.physical_audit_count, 10) || 0), 0);

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
                      {/* Warehouse Top Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '280px' }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Filter by Warehouse
                        </label>
                        <select
                          value={inventoryWarehouseFilter}
                          onChange={(e) => setInventoryWarehouseFilter(e.target.value)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.82rem',
                            outline: 'none',
                            backgroundColor: 'var(--bg-main)',
                            color: 'var(--text-dark)',
                            cursor: 'pointer',
                            fontWeight: '700'
                      }}
                    >
                      <option value="All">All Warehouses</option>
                      {warehousesList.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>

                  {/* Overview Stats Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {/* Card 1: Total Clients */}
                    <div className="diagnostic-card" style={{ padding: '16px 20px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Clients</span>
                        <div style={{ backgroundColor: 'var(--primary-light)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                          <Users size={16} color="var(--primary)" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '4px' }}>
                        <div>
                          <h3 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'var(--text-dark)' }}>{uniqueClients}</h3>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Unique active clients</span>
                        </div>
                        <button
                          onClick={() => {
                            setInventorySubView('breakdown');
                            setBreakdownCurrentPage(1);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: 'var(--primary)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Eye size={12} /> View Details
                        </button>
                      </div>
                    </div>

                    {/* Card 2: Total Physical Boxes */}
                    <div className="diagnostic-card" style={{ padding: '16px 20px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Boxes</span>
                        <div style={{ backgroundColor: '#e0f2fe', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                          <Package size={16} color="#0284c7" />
                        </div>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'var(--text-dark)' }}>{totalBoxes.toLocaleString()}</h3>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Boxes stored on floor</span>
                      </div>
                    </div>

                    {/* Card 3: Total Chambers */}
                    <div className="diagnostic-card" style={{ padding: '16px 20px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Chambers</span>
                        <div style={{ backgroundColor: '#fef3c7', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                          <LayoutGrid size={16} color="#d97706" />
                        </div>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'var(--text-dark)' }}>{uniqueChambers}</h3>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Chambers with inventory</span>
                      </div>
                    </div>
                  </div>
                </div>
                  );
                })()}

                {/* Filter / Search bar */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2, minWidth: '240px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>Search Client Name</label>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Search by client name..."
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px 8px 34px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          fontSize: '0.8rem',
                          outline: 'none',
                          backgroundColor: 'var(--bg-main)',
                          color: 'var(--text-dark)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Discrepancy Only Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                    <input
                      type="checkbox"
                      id="inventoryDiscrepancyOnly"
                      checked={inventoryDiscrepancyFilter}
                      onChange={(e) => setInventoryDiscrepancyFilter(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="inventoryDiscrepancyOnly" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dark)', cursor: 'pointer' }}>
                      Discrepancy Only (Mismatch Stock)
                    </label>
                  </div>
                </div>

                {/* Inventory Table */}
                {loadingInventory ? (
                  <SaDataLoading label="Calculating inventory stock reconciliation…" />
                ) : inventoryLogs.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span>No stock records found matching filters.</span>
                  </div>
                ) : (
                  <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Client</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Warehouse</th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Inward (+)</th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Outward (-)</th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Book Balance</th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Physical Floor Audit</th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Variance / Discrepancy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryLogs
                          .filter(row => {
                            if (inventoryDiscrepancyFilter) {
                              return Number(row.discrepancy) !== 0;
                            }
                            return true;
                          })
                          .map((row, idx) => {
                            const hasDiscrepancy = Number(row.discrepancy) !== 0;
                            const formattedDate = row.last_audit_date ? new Date(row.last_audit_date).toLocaleDateString('en-GB') : '-';
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border)', backgroundColor: hasDiscrepancy ? 'rgba(239, 68, 68, 0.03)' : 'transparent' }}>
                                <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-dark)', fontWeight: '700' }}>
                                  {row.client_name}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  {row.warehouse_name || '-'}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-dark)' }}>
                                  {row.total_inward_boxes.toLocaleString()}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-dark)' }}>
                                  {row.total_outward_boxes.toLocaleString()}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary)' }}>
                                  {row.calculated_balance.toLocaleString()}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem' }}>
                                  <span style={{ fontWeight: '700', color: 'var(--text-dark)' }}>{row.physical_audit_count.toLocaleString()}</span>
                                  {row.chamber_name && (
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                      {row.chamber_name} ({formattedDate})
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                  {hasDiscrepancy ? (
                                    <span style={{
                                      padding: '4px 8px',
                                      borderRadius: 'var(--radius-sm)',
                                      backgroundColor: '#fee2e2',
                                      color: '#ef4444',
                                      fontWeight: '800',
                                      fontSize: '0.74rem',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      âš ï¸ {row.discrepancy > 0 ? `+${row.discrepancy} Excess` : `${row.discrepancy} Shortage`}
                                    </span>
                                  ) : (
                                    <span style={{
                                      padding: '4px 8px',
                                      borderRadius: 'var(--radius-sm)',
                                      backgroundColor: '#dcfce7',
                                      color: '#15803d',
                                      fontWeight: '800',
                                      fontSize: '0.74rem'
                                    }}>
                                      ✓ Matched
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

          </div>
        )}

        {/* --- Menu: Daily Box Tracker (client month box in/out/left sheet) --- */}
        {activeMenu === 'daily_box_tracker' && (() => {
          // --- Daily Box Tracker UI (filters, pie chart, client table, optional day detail) ---
          const liveWarehouses = inventoryFilterOptions.warehouses || [];
          const selectedWh = liveWarehouses.find(
            (w) => String(w.name).toLowerCase().trim() === String(deltasWarehouseFilter).toLowerCase().trim()
          );

          const clientsForWarehouse = deltasWarehouseFilter === 'All'
            ? Array.from(new Set(liveWarehouses.flatMap((w) => w.clients || []))).sort((a, b) => a.localeCompare(b))
            : (selectedWh?.clients || []);

          /**
           * "Left Now" column: use last physical chamber count if we have it,
           * otherwise fall back to book balance (inward âˆ’ outward).
           */
          const leftNowOf = (row) => {
            if (row == null) return 0;
            if (row.physical_audit_count != null && row.physical_audit_count !== '') {
              return Math.max(0, Number(row.physical_audit_count) || 0);
            }
            return Math.max(0, Number(row.calculated_balance) || 0);
          };

          // Lot rows → one row per client (+ warehouse). In/Out are client-warehouse totals (not sum of chambers).
          const lotRows = (dailyDeltas || [])
            .filter((row) => {
              if (!row || !row.client_name) return false;
              if (deltasWarehouseFilter !== 'All') {
                const rowWh = String(row.warehouse_name || '').toLowerCase().trim();
                const selWh = String(deltasWarehouseFilter).toLowerCase().trim();
                if (rowWh !== selWh) return false;
              }
              if (deltasClientFilter !== 'All' && row.client_name !== deltasClientFilter) return false;
              return true;
            });

          const clientMap = new Map();
          lotRows.forEach((row) => {
            const client = String(row.client_name || '').trim();
            const wh = String(row.warehouse_name || '').trim();
            const key = `${client.toLowerCase()}|||${wh.toLowerCase()}`;
            const inward = Math.max(0, Number(row.total_inward_boxes) || 0);
            const outward = Math.max(0, Number(row.total_outward_boxes) || 0);
            const bal = Math.max(0, Number(row.calculated_balance) || 0);
            const phys = Math.max(0, Number(row.physical_audit_count) || 0);
            const audit = String(row.last_audit_date || '');
            const prev = clientMap.get(key);
            if (!prev) {
              clientMap.set(key, {
                client_name: client,
                warehouse_name: wh || null,
                chamber_name: null,
                total_inward_boxes: inward,
                total_outward_boxes: outward,
                calculated_balance: bal,
                physical_audit_count: phys,
                last_audit_date: audit || null,
                discrepancy: bal - phys
              });
              return;
            }
            // Same client+warehouse: keep In/Out/Bal once; sum physical Left across chambers
            prev.physical_audit_count = (Number(prev.physical_audit_count) || 0) + phys;
            if (audit && (!prev.last_audit_date || audit > String(prev.last_audit_date))) {
              prev.last_audit_date = audit;
            }
            prev.total_inward_boxes = Math.max(prev.total_inward_boxes, inward);
            prev.total_outward_boxes = Math.max(prev.total_outward_boxes, outward);
            prev.calculated_balance = Math.max(prev.calculated_balance, bal);
            prev.discrepancy =
              Math.max(0, Number(prev.calculated_balance) || 0) -
              Math.max(0, Number(prev.physical_audit_count) || 0);
          });

          const filteredRows = Array.from(clientMap.values()).sort((a, b) => {
            const da = String(a.last_audit_date || '');
            const db = String(b.last_audit_date || '');
            if (db !== da) return db.localeCompare(da);
            return String(a.client_name || '').localeCompare(String(b.client_name || ''));
          });

          const totalBoxes = filteredRows.reduce((sum, r) => sum + leftNowOf(r), 0);
          const uniqueClientsInData = new Set(filteredRows.map((r) => r.client_name)).size;

          const clientBoxMap = {};
          filteredRows.forEach((r) => {
            const name = r.client_name || 'Unknown';
            clientBoxMap[name] = (clientBoxMap[name] || 0) + leftNowOf(r);
          });
          const PIE_COLORS = [
            '#0284c7', '#0f766e', '#7c3aed', '#ea580c', '#16a34a',
            '#db2777', '#4f46e5', '#ca8a04', '#0891b2', '#dc2626'
          ];
          const clientPieSlices = Object.entries(clientBoxMap)
            .map(([name, boxes]) => ({ name, boxes }))
            .sort((a, b) => b.boxes - a.boxes);

          const renderClientBoxesPieSvg = () => {
            const size = 200;
            const cx = size / 2;
            const cy = size / 2;
            const radius = 78;
            const innerR = 48;
            const slices = clientPieSlices;
            const total = slices.reduce((s, x) => s + x.boxes, 0) || 0;

            if (!slices.length || total <= 0) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: size, height: size }}>
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                      <circle cx={cx} cy={cy} r={radius} fill="#f1f5f9" />
                      <circle cx={cx} cy={cy} r={innerR} fill="var(--surface, #fff)" />
                    </svg>
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexDirection: 'column', pointerEvents: 'none'
                    }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#94a3b8' }}>0</span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8' }}>boxes</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    No client box data matches this filter.
                  </div>
                </div>
              );
            }

            const polar = (angleDeg, r) => {
              const rad = ((angleDeg - 90) * Math.PI) / 180;
              return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
            };

            let angle = 0;
            const paths = slices.map((slice, idx) => {
              const portion = slice.boxes / total;
              const sweep = Math.max(portion * 360, portion > 0 ? 0.3 : 0);
              const startA = angle;
              const endA = angle + sweep;
              angle = endA;
              const large = sweep > 180 ? 1 : 0;
              const p1 = polar(startA, radius);
              const p2 = polar(endA, radius);
              const p3 = polar(endA, innerR);
              const p4 = polar(startA, innerR);
              const d = [
                `M ${p1.x} ${p1.y}`,
                `A ${radius} ${radius} 0 ${large} 1 ${p2.x} ${p2.y}`,
                `L ${p3.x} ${p3.y}`,
                `A ${innerR} ${innerR} 0 ${large} 0 ${p4.x} ${p4.y}`,
                'Z'
              ].join(' ');
              return {
                ...slice,
                d,
                color: PIE_COLORS[idx % PIE_COLORS.length],
                pct: Math.round(portion * 1000) / 10
              };
            });

            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Client boxes distribution">
                    {paths.map((p) => (
                      <path
                        key={p.name}
                        d={p.d}
                        fill={p.color}
                        stroke="var(--surface, #fff)"
                        strokeWidth={2}
                      >
                        <title>{`${p.name}: ${p.boxes.toLocaleString()} boxes (${p.pct}%)`}</title>
                      </path>
                    ))}
                  </svg>
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    pointerEvents: 'none'
                  }}>
                    <span style={{
                      fontSize: String(total).length > 5 ? '0.95rem' : '1.25rem',
                      fontWeight: 900,
                      color: 'var(--text-dark)',
                      lineHeight: 1.1
                    }}>
                      {loadingDeltas ? '…' : total.toLocaleString()}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      left now
                    </span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', marginTop: 2 }}>
                      {uniqueClientsInData} clients
                    </span>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 200,
                  overflowY: 'auto',
                  minWidth: 200,
                  flex: 1
                }}>
                  {paths.map((p) => (
                    <div
                      key={p.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.76rem'
                      }}
                    >
                      <span style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: p.color,
                        flexShrink: 0
                      }} />
                      <span style={{
                        fontWeight: 700,
                        color: 'var(--text-dark)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {p.boxes.toLocaleString()}
                        <span style={{ fontWeight: 600, marginLeft: 4 }}>({p.pct}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          };

          const clientCountLabel = deltasWarehouseFilter === 'All'
            ? `Showing ${filteredRows.length} clients · ${totalBoxes.toLocaleString()} left`
            : `${deltasWarehouseFilter}: ${filteredRows.length} clients · ${totalBoxes.toLocaleString()} left`;

          const pageStart = (deltasCurrentPage - 1) * deltasPerPage;
          const paginatedRows = filteredRows.slice(pageStart, pageStart + deltasPerPage);

          const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const parts = String(dateStr).split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            try {
              return new Date(dateStr).toLocaleDateString('en-GB');
            } catch (_) {
              return String(dateStr);
            }
          };

          const handleExportBoxInventoryCSV = () => {
            if (!filteredRows.length) return;
            const headers = 'Client,Warehouse,Left Now,Last Audit\n';
            const csvContent = headers + filteredRows.map((row) => {
              const left = leftNowOf(row);
              return [
                `"${row.client_name || '-'}"`,
                `"${row.warehouse_name || '-'}"`,
                left,
                `"${formatDate(row.last_audit_date)}"`
              ].join(',');
            }).join('\n');
            const whTag = deltasWarehouseFilter === 'All' ? 'All' : String(deltasWarehouseFilter).replace(/\s+/g, '_');
            downloadCsv(`Box_Inventory_IO_${whTag}_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
          };

          return (
            <div className="sa-op-gmail sa-box-tracker">
              {deltasViewClient ? (() => {
                const row = deltasViewClient;
                const meta = clientMonthSheet?.meta || {};
                const daysAsc = Array.isArray(clientMonthSheet?.days) ? clientMonthSheet.days : [];
                const daysDesc = [...daysAsc].reverse();
                const pageDays = daysDesc.slice(
                  (monthSheetPage - 1) * monthSheetPerPage,
                  monthSheetPage * monthSheetPerPage
                );
                const fmtDay = (ymd) => {
                  if (!ymd) return '—';
                  const p = String(ymd).split('-');
                  if (p.length === 3) {
                    const dt = new Date(`${ymd}T12:00:00`);
                    const wd = Number.isNaN(dt.getTime())
                      ? ''
                      : dt.toLocaleDateString('en-GB', { weekday: 'short' });
                    return wd ? `${wd} · ${p[2]}/${p[1]}/${p[0]}` : `${p[2]}/${p[1]}/${p[0]}`;
                  }
                  return String(ymd);
                };
                const cell = (n) => {
                  const v = Number(n);
                  if (!Number.isFinite(v)) return '0';
                  return v.toLocaleString();
                };
                const openLeft = Number(meta.opening_left || 0);
                const inTotal = Number(meta.month_inward_total || 0);
                const outTotal = Number(meta.month_outward_total || 0);
                const closeLeft = Number(meta.closing_total ?? openLeft);
                return (
                  <section className="sa-op-card sa-box-day-detail">
                    <div className="sa-op-dir-toolbar sa-box-day-toolbar">
                      <div className="sa-box-day-toolbar-left">
                        <button
                          type="button"
                          className="sa-box-back-btn"
                          onClick={() => closeClientMonthSheet()}
                        >
                          ← Back to clients
                        </button>
                        <div className="sa-box-day-heading">
                          <h2 className="sa-op-title">{meta.client_name || row.client_name}</h2>
                          <p className="sa-op-sub">
                            {meta.warehouse_name || row.warehouse_name || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="sa-box-day-range">
                        <label className="sa-op-field">
                          <span>From</span>
                          <input
                            type="date"
                            className="sa-op-filter"
                            value={monthSheetFromDate || ''}
                            onChange={(e) => setMonthSheetFromDate(e.target.value)}
                          />
                        </label>
                        <label className="sa-op-field">
                          <span>To</span>
                          <input
                            type="date"
                            className="sa-op-filter"
                            value={monthSheetToDate || ''}
                            onChange={(e) => setMonthSheetToDate(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="sa-op-btn-primary"
                          disabled={loadingMonthSheet}
                          onClick={() =>
                            openClientMonthSheet(row, {
                              fromDate: monthSheetFromDate,
                              toDate: monthSheetToDate
                            })
                          }
                        >
                          {loadingMonthSheet ? <Loader2 size={14} className="spinner-icon" /> : <Activity size={14} />}
                          Apply
                        </button>
                      </div>
                    </div>

                    <div className="sa-box-day-body">
                      {monthSheetError && (
                        <LoadErrorBanner
                          message={monthSheetError}
                          onRetry={() => openClientMonthSheet(row)}
                          onDismiss={() => setMonthSheetError('')}
                        />
                      )}

                      <div className="sa-box-day-stats">
                        <div className="sa-box-day-stat">
                          <span className="sa-box-day-stat-label">Opening left</span>
                          <strong className="sa-box-day-stat-value">{openLeft.toLocaleString()}</strong>
                        </div>
                        <div className="sa-box-day-stat in">
                          <span className="sa-box-day-stat-label">Total Received</span>
                          <strong className="sa-box-day-stat-value">{inTotal.toLocaleString()}</strong>
                        </div>
                        <div className="sa-box-day-stat out">
                          <span className="sa-box-day-stat-label">Total Dispatch</span>
                          <strong className="sa-box-day-stat-value">{outTotal.toLocaleString()}</strong>
                        </div>
                        <div className="sa-box-day-stat left">
                          <span className="sa-box-day-stat-label">Closing left</span>
                          <strong className="sa-box-day-stat-value">{closeLeft.toLocaleString()}</strong>
                        </div>
                      </div>

                      {loadingMonthSheet ? (
                        <SaDataLoading label="Loading day-wise Received / Dispatch / Left…" />
                      ) : daysDesc.length === 0 ? (
                        <div className="sa-box-empty">No received/dispatch movement in this date range.</div>
                      ) : (
                        <>
                          <p className="sa-box-day-formula" role="note">
                            <span className="sa-box-day-formula-label">Day formula</span>
                            <span className="sa-box-day-formula-eq">
                              Start + Received âˆ’ Dispatch = Left
                            </span>
                            <span className="sa-box-day-formula-hint">
                              Sirf Received / Dispatch records · Start = previous Left
                            </span>
                          </p>
                          <div className="sa-box-day-table-wrap table-responsive">
                            <table className="logs-table sa-box-day-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th className="sa-box-th-center">Start</th>
                                  <th className="sa-box-th-center">Received</th>
                                  <th className="sa-box-th-center">Dispatch</th>
                                  <th className="sa-box-th-center">Left</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pageDays.map((d) => {
                                  const inn = Math.max(0, Number(d.inward_boxes) || 0);
                                  const out = Math.max(0, Number(d.outward_boxes) || 0);
                                  const hasPrevious = d.has_previous !== false && d.start_left != null;
                                  const start = hasPrevious
                                    ? Math.max(0, Number(d.start_left) || 0)
                                    : null;
                                  const left = d.left_boxes != null
                                    ? Math.max(0, Number(d.left_boxes) || 0)
                                    : Math.max(0, Number(d.total_boxes) || 0);
                                  let rowEq = null;
                                  if (start != null && (inn > 0 || out > 0)) {
                                    if (inn > 0 && out > 0) {
                                      rowEq = `${cell(start)} + ${cell(inn)} âˆ’ ${cell(out)} = ${cell(left)}`;
                                    } else if (inn > 0) {
                                      rowEq = `${cell(start)} + ${cell(inn)} = ${cell(left)}`;
                                    } else {
                                      rowEq = `${cell(start)} âˆ’ ${cell(out)} = ${cell(left)}`;
                                    }
                                  }
                                  return (
                                    <tr key={d.date} className={inn || out ? 'sa-box-day-row-active' : ''}>
                                      <td className="sa-box-day-date">{fmtDay(d.date)}</td>
                                      <td className="sa-box-td-center sa-box-day-start">
                                        {start != null ? cell(start) : ''}
                                      </td>
                                      <td className="sa-box-td-center sa-box-day-in">
                                        {inn > 0 ? cell(inn) : ''}
                                      </td>
                                      <td className="sa-box-td-center sa-box-day-out">
                                        {out > 0 ? cell(out) : ''}
                                      </td>
                                      <td className="sa-box-td-center sa-box-day-left">
                                        {cell(left)}
                                        {rowEq ? <div className="sa-box-day-row-eq">{rowEq}</div> : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <PaginationBar
                            page={monthSheetPage}
                            totalItems={daysDesc.length}
                            pageSize={monthSheetPerPage}
                            onPageChange={setMonthSheetPage}
                            itemLabel="days"
                          />
                        </>
                      )}
                    </div>
                  </section>
                );
              })() : (
              <>
              <section className="sa-op-card">
                <div className="sa-op-dir-toolbar">
                  <div>
                    <h2 className="sa-op-title">Daily Box Inventory Tracker</h2>
                    <p className="sa-op-sub">
                      Client stock by warehouse — click a client for day-wise Received / Dispatch / Left.
                    </p>
                  </div>
                  <div className="sa-op-dir-tools">
                    <button
                      type="button"
                      className="sa-op-btn-primary"
                      onClick={() => loadDailyBoxTrackerData()}
                      disabled={loadingDeltas}
                    >
                      {loadingDeltas ? <Loader2 size={14} className="spinner-icon" /> : <Activity size={14} />}
                      Refresh Live Data
                    </button>
                  </div>
                </div>
                {deltasError && (
                  <LoadErrorBanner
                    message={deltasError}
                    onRetry={() => loadDailyBoxTrackerData()}
                    onDismiss={() => setDeltasError('')}
                  />
                )}
              </section>

              <section className="sa-op-card">
                <div className="sa-box-filters-body">
                  <label className="sa-op-field" style={{ minWidth: 220 }}>
                    <span>Warehouse (Live DB)</span>
                    <select
                      className={`sa-op-filter${deltasWarehouseFilter !== 'All' ? ' sa-op-filter-active' : ''}`}
                      value={deltasWarehouseFilter}
                      onChange={(e) => {
                        const wh = e.target.value;
                        setDeltasWarehouseFilter(wh);
                        setDeltasClientFilter('All');
                        setDeltasCurrentPage(1);
                        loadDailyBoxTrackerData(wh);
                      }}
                    >
                      <option value="All">
                        All Warehouses ({inventoryFilterOptions.total_warehouses})
                      </option>
                      {liveWarehouses.map((w) => (
                        <option key={w.name} value={w.name}>
                          {w.name} ({w.client_count} clients)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="sa-op-field" style={{ minWidth: 220 }}>
                    <span>Client (by Warehouse)</span>
                    <select
                      className={`sa-op-filter${deltasClientFilter !== 'All' ? ' sa-op-filter-active' : ''}`}
                      value={deltasClientFilter}
                      onChange={(e) => {
                        setDeltasClientFilter(e.target.value);
                        setDeltasCurrentPage(1);
                      }}
                    >
                      <option value="All">
                        All Clients ({clientsForWarehouse.length})
                      </option>
                      {clientsForWarehouse.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="sa-op-btn-text"
                    onClick={() => {
                      setDeltasWarehouseFilter('All');
                      setDeltasClientFilter('All');
                      setDeltasCurrentPage(1);
                      loadDailyBoxTrackerData('All');
                    }}
                  >
                    Clear Filters
                  </button>

                  <div className={`sa-box-live-badge${loadingDeltas ? ' loading' : ''}`}>
                    <span className="sa-box-live-dot" />
                    {loadingDeltas ? 'Loading live DB…' : clientCountLabel}
                  </div>
                </div>
              </section>

              <section className="sa-op-card">
                <div className="sa-box-chart-body">
                  <div className="sa-box-chart-head">
                    <h3 className="sa-box-chart-title">
                      <span className="sa-box-live-dot" />
                      Clients Ã— Boxes left
                    </h3>
                    <span className="sa-box-chart-sub">
                      {deltasWarehouseFilter === 'All' ? 'All Warehouses' : deltasWarehouseFilter}
                      {deltasClientFilter !== 'All' ? ` · ${deltasClientFilter}` : ''}
                      {' · '}
                      Left {totalBoxes.toLocaleString()}
                    </span>
                  </div>
                  {renderClientBoxesPieSvg()}
                </div>
              </section>

              <section className="sa-op-card">
                <div className="sa-box-table-head">
                  <h3 className="sa-op-title">
                    {deltasWarehouseFilter === 'All'
                      ? 'All Warehouses — Client Stock'
                      : `${deltasWarehouseFilter} — Client Stock`}
                  </h3>
                  <div className="sa-box-table-meta">
                    <span>
                      Left now: <strong>{totalBoxes.toLocaleString()}</strong>
                    </span>
                    <button
                      type="button"
                      className="sa-op-btn-export"
                      onClick={handleExportBoxInventoryCSV}
                      disabled={filteredRows.length === 0}
                    >
                      <Download size={14} />
                      Export
                    </button>
                  </div>
                </div>

                {loadingDeltas ? (
                  <SaDataLoading label="Loading client stock…" />
                ) : filteredRows.length === 0 ? (
                  <div className="sa-box-empty">No clients match this filter.</div>
                ) : (
                  <>
                    <div className="sa-box-table-wrap table-responsive">
                      <table className="logs-table">
                        <thead>
                          <tr>
                            <th>Client</th>
                            <th>Warehouse</th>
                            <th className="sa-box-th-center">Left Now</th>
                            <th className="sa-box-th-center">Last Audit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRows.map((row, idx) => {
                            const left = leftNowOf(row);
                            return (
                              <tr
                                key={`${row.client_name}-${row.warehouse_name}-${idx}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => openClientMonthSheet(row)}
                                title="View day-wise In / Out / Left"
                              >
                                <td className="sa-box-client-name" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                                  {row.client_name}
                                </td>
                                <td className="sa-box-muted">{row.warehouse_name || '-'}</td>
                                <td className="sa-box-td-center sa-box-qty-latest">
                                  {left.toLocaleString()}
                                </td>
                                <td className="sa-box-td-center sa-box-muted">
                                  {formatDate(row.last_audit_date)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {filteredRows.length > 0 && (
                      <PaginationBar
                        page={deltasCurrentPage}
                        totalItems={filteredRows.length}
                        pageSize={deltasPerPage}
                        onPageChange={setDeltasCurrentPage}
                        itemLabel="clients"
                      />
                    )}
                  </>
                )}
              </section>
              </>
              )}
            </div>
          );
        })()}


        {/* --- Menu: History logs (daily / inward / outward tables, export, delete) --- */}
        {activeMenu === 'history_logs' && (
          <div className={`sa-um sa-history sa-history--${historyTab}`}>
            <div className="sa-gmail-tabs sa-gmail-tabs-wrap">
              <button
                type="button"
                className={`sa-gmail-tab${historyTab === 'daily' ? ' active' : ''}`}
                onClick={() => {
                  setHistoryTab('daily');
                  setHistoryPage(1);
                }}
              >
                <Thermometer size={14} />
                Chamber Logs
              </button>
              <button
                type="button"
                className={`sa-gmail-tab${historyTab === 'inward' ? ' active' : ''}`}
                onClick={() => {
                  setHistoryTab('inward');
                  setHistoryPage(1);
                }}
              >
                <Package size={14} />
                Inward Logs
              </button>
              <button
                type="button"
                className={`sa-gmail-tab${historyTab === 'outward' ? ' active' : ''}`}
                onClick={() => {
                  setHistoryTab('outward');
                  setHistoryPage(1);
                }}
              >
                <History size={14} />
                Outward Logs
              </button>
            </div>

            <div className="sa-op-gmail">
              <section className="sa-op-card sa-op-directory">
                <div className="sa-op-dir-toolbar sa-history-toolbar">
                  <div className="sa-history-heading">
                    <p className="sa-history-kicker">
                      {historyTab === 'daily' ? 'Chamber Logs' : historyTab === 'inward' ? 'Inward Logs' : 'Outward Logs'}
                    </p>
                    <h2 className="sa-op-title">System History Database Logs</h2>
                    <p className="sa-op-sub">
                      {historyTab === 'daily'
                        ? 'Chamber temperature inspection history — filter by warehouse, shift, search, or date'
                        : historyTab === 'inward'
                          ? 'Inward receiving & unloading history — filter by warehouse, search, or date'
                          : 'Outward loading & dispatch history — filter by warehouse, search, or date'}
                    </p>
                  </div>
                  <div className="sa-op-dir-tools">
                    <span className="sa-history-count">
                      {Number(historyTotal || 0).toLocaleString()} records
                    </span>
                    <select
                      className="sa-op-filter"
                      value={selectedWarehouse}
                      onChange={(e) => {
                        setSelectedWarehouse(e.target.value);
                        setHistoryPage(1);
                      }}
                      title="Warehouse filter"
                    >
                      <option value="All">All Warehouses</option>
                      {warehousesList.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                    {historyTab === 'daily' ? (
                      <div className="sa-history-shift" role="group" aria-label="Shift filter">
                        {['All', 'Morning', 'Evening'].map((shift) => (
                          <button
                            key={shift}
                            type="button"
                            className={`sa-history-shift-btn${historyShiftFilter === shift ? ' active' : ''}`}
                            onClick={() => {
                              setHistoryShiftFilter(shift);
                              setHistoryPage(1);
                            }}
                          >
                            {shift === 'All' ? 'All shifts' : shift}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="sa-op-dir-tools sa-activity-filters">
                  <label
                    className="sa-op-search"
                    title={
                      historyTab === 'daily'
                        ? 'Search matches: Date, Ref No, Chamber, Client Name, or Supervisor'
                        : 'Search matches: Date, Ref No, Vehicle Number, Client Name, Supervisor, Transporter, or Driver'
                    }
                  >
                    <Search size={14} />
                    <input
                      type="search"
                      placeholder={
                        historyTab === 'daily'
                          ? 'Ref No, client, chamber, supervisor…'
                          : 'Ref No, vehicle, client, supervisor…'
                      }
                      value={logsSearch}
                      onChange={(e) => setLogsSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (fromDate && toDate && fromDate > toDate) {
                            alert("âš ï¸ Date Range Error:\n'From Date' must be less than or equal to 'To Date'.");
                            return;
                          }
                          setAppliedFromDate(fromDate);
                          setAppliedToDate(toDate);
                          setAppliedLogsSearch(logsSearch);
                          setHistoryPage(1);
                        }
                      }}
                    />
                  </label>
                  <input
                    className="sa-op-filter"
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFromDate(val);
                      if (val && toDate && val > toDate) {
                        setToDate(val);
                      }
                    }}
                    title="From date"
                  />
                  <input
                    className="sa-op-filter"
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => {
                      const val = e.target.value;
                      setToDate(val);
                      if (val && fromDate && val < fromDate) {
                        setFromDate(val);
                      }
                    }}
                    title="To date"
                  />
                  <button
                    type="button"
                    className="sa-op-btn-primary"
                    onClick={() => {
                      if (fromDate && toDate && fromDate > toDate) {
                        alert("âš ï¸ Date Range Error:\n'From Date' must be less than or equal to 'To Date'.");
                        return;
                      }
                      setAppliedFromDate(fromDate);
                      setAppliedToDate(toDate);
                      setAppliedLogsSearch(logsSearch);
                      setHistoryPage(1);
                    }}
                  >
                    <Search size={14} />
                    Find
                  </button>
                  <button
                    type="button"
                    className="sa-op-btn-text"
                    onClick={() => {
                      setFromDate('');
                      setToDate('');
                      setAppliedFromDate('');
                      setAppliedToDate('');
                      setAppliedLogsSearch('');
                      setLogsSearch('');
                      setHistoryShiftFilter('All');
                      setHistoryPage(1);
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="sa-op-btn-export"
                    onClick={handleExportLogsExcel}
                    disabled={logsExportLoading || loadingLogs}
                  >
                    <Download size={14} />
                    <span>
                      {logsExportLoading
                        ? logsExportProgressLabel
                        : historyTab === 'daily'
                          ? 'Export Chamber Logs'
                          : historyTab === 'inward'
                            ? 'Export Inward Logs'
                            : 'Export Outward Logs'}
                    </span>
                  </button>
                  {logsExportLoading && (
                    <button
                      type="button"
                      className="sa-op-btn-text"
                      onClick={() => {
                        exportAbortRef.current?.abort();
                        setLogsExportLoading(false);
                        setLogsExportProgressLabel('Exporting…');
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {exportError?.retryKey === 'history' && (
                  <div className="sa-op-banner-wrap">
                    <ExportErrorBanner
                      message={exportError.message}
                      retryable={exportError.retryable}
                      onRetry={retryFailedExport}
                      onDismiss={() => setExportError(null)}
                    />
                  </div>
                )}

                {loadingLogs ? (
                  <SaDataLoading label="Loading system database logs…" />
                ) : getFilteredHistoryLogs().length === 0 ? (
                  <div className="sa-op-empty">
                    <Database size={28} />
                    <p>No logs found matching your filters.</p>
                  </div>
                ) : (
                  <>
                    <div className="sa-history-sheet-banner">
                      {historyTab === 'daily'
                        ? 'Chamber Logs'
                        : historyTab === 'inward'
                          ? 'Inward Logs'
                          : 'Outward Logs'}
                    </div>
                    <div className="sa-history-table-wrap">
                      <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          {historyTab === 'daily' && (
                            <tr>
                              <th>Date</th>
                              <th>Ref No</th>
                              <th>Warehouse</th>
                              <th>Operator Email</th>
                              <th>Chamber</th>
                              <th>Client Name</th>
                              <th>Shift</th>
                              <th>Inspection Time</th>
                              <th>Temp (°C)</th>
                              <th>Chamber Type</th>
                              <th>Supervisor</th>
                              <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                          )}
                          {historyTab === 'inward' && (
                            <tr>
                              <th>Date</th>
                              <th>Ref No</th>
                              <th>Warehouse</th>
                              <th>Operator Email</th>
                              <th>Vehicle No</th>
                              <th>Invoice No</th>
                              <th>Mens Power</th>
                              <th>Client</th>
                              <th>Dock No</th>
                              <th>Vehicle Temp</th>
                              <th>Material Temp</th>
                              <th>Pallets</th>
                              <th>Unloading Duration</th>
                              <th>Supervisor</th>
                              <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                          )}
                          {historyTab === 'outward' && (
                            <tr>
                              <th>Date</th>
                              <th>Ref No</th>
                              <th>Warehouse</th>
                              <th>Operator Email</th>
                              <th>Vehicle No</th>
                              <th>Invoice No</th>
                              <th>Mens Power</th>
                              <th>Client</th>
                              <th>Dock No</th>
                              <th>Vehicle Temp</th>
                              <th>Material Temp</th>
                              <th>Pallets</th>
                              <th>Loading Duration</th>
                              <th>Supervisor</th>
                              <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                          )}
                        </thead>
                        <tbody>
                    {historyTab === 'daily' && getFilteredHistoryLogs().map((log) => {
                       if (!log) return null;
                       const rowTemp = log.chamber_temp ?? log.box_temp;
                       const rowType =
                         pickComplianceZone(log.chamber_type) ||
                         String(log.chamber_type || '').trim() ||
                         'Frozen';
                       const rowDev = getChamberTempDeviation(rowTemp, rowType);
                       const rowOor = rowDev != null;
                       const rowTypeLabel =
                         rowDev === 'low' ? `< ${rowType}` : rowDev === 'high' ? `> ${rowType}` : rowType;
                       const tempText = formatTempDisplay(rowTemp) || (rowTemp != null ? `${rowTemp}°C` : '—');
                       return (
                      <tr key={log.id}>
                        <td style={{ padding: '12px 16px', fontWeight: '600' }}>
                          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                            <span>{log.formatted_date || (log.entry_date ? log.entry_date.split('T')[0] : '')}</span>
                            {log.overdue_time && log.overdue_time !== 'same day' && (
                              <span style={{ 
                                backgroundColor: '#fee2e2', 
                                color: '#dc2626', 
                                fontSize: '9px', 
                                fontWeight: 'bold', 
                                padding: '1px 4px', 
                                borderRadius: '4px', 
                                border: '0.5px solid #fca5a5'
                              }}>
                                âš ï¸ Late ({log.overdue_time})
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (log.reference_no) {
                                navigator.clipboard.writeText(log.reference_no);
                                setCopiedRef(log.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === log.reference_no ? '#10b981' : 'var(--primary)',
                              fontWeight: '700',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {log.reference_no || '-'}
                            {log.reference_no && (
                              copiedRef === log.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className="status-badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 800 }}>
                            {log.warehouse_name || 'Generic'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{renderOperatorEmail(log.operator_email)}</td>
                        <td style={{ padding: '12px 16px' }}>{log.chamber_name}</td>
                        <td style={{ padding: '12px 16px' }}>{log.client_name}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          {resolveShiftLabel(log.shift, log.inspection_time, log.created_at)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{log.inspection_time}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className="status-badge" style={{ 
                            backgroundColor: rowTemp == null ? '#f1f5f9' : rowOor ? '#fee2e2' : '#dcfce7', 
                            color: rowTemp == null ? '#64748b' : rowOor ? '#b91c1c' : '#15803d', 
                            fontWeight: 800 
                          }}>
                            {tempText}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            color: rowOor ? '#b91c1c' : '#475569'
                          }}>
                            {rowTypeLabel}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{log.monitor_supervisor_name}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {renderSaLogActions('daily', log)}
                        </td>
                      </tr>
                       )
                    })}
                    {historyTab === 'inward' && getFilteredHistoryLogs().map((log) => {
                       if (!log) return null;
                       return (
                      <tr key={log.inward_id}>
                        <td style={{ padding: '12px 16px', fontWeight: '600' }}>
                          {log.inward_entry_date ? log.inward_entry_date.split('T')[0] : ''}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (log.reference_no) {
                                navigator.clipboard.writeText(log.reference_no);
                                setCopiedRef(log.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === log.reference_no ? '#10b981' : 'var(--primary)',
                              fontWeight: '700',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {log.reference_no || '-'}
                            {log.reference_no && (
                              copiedRef === log.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className="status-badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 800 }}>
                            {log.warehouse_name || 'Generic'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{renderOperatorEmail(log.operator_email)}</td>
                        <td style={{ padding: '12px 16px', fontWeight: '700' }}>{log.inward_vehicle_no}</td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_invoice_no != null && String(log.inward_invoice_no).trim() !== '' ? log.inward_invoice_no : '-'}</td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_mens_power != null && log.inward_mens_power !== '' ? log.inward_mens_power : '-'}</td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_client_name}</td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_dock_no || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_vehicle_temp}°C</td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_material_temp}°C</td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_pallets_in_qty}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700 }}>
                            {formatDuration(log.inward_unloading_duration_hours, log.inward_unloading_duration_mins)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                            <div>S: {log.inward_unloading_start_time || '-'}</div>
                            <div>E: {log.inward_unloading_end_time || '-'}</div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{log.inward_unloading_supervisor_name}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {renderSaLogActions('inward', log)}
                        </td>
                      </tr>
                       )
                    })}
                    {historyTab === 'outward' && getFilteredHistoryLogs().map((log) => {
                       if (!log) return null;
                       return (
                      <tr key={log.outward_id}>
                        <td style={{ padding: '12px 16px', fontWeight: '600' }}>
                          {log.outward_entry_date ? log.outward_entry_date.split('T')[0] : ''}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (log.reference_no) {
                                navigator.clipboard.writeText(log.reference_no);
                                setCopiedRef(log.reference_no);
                                setTimeout(() => setCopiedRef(null), 1500);
                              }
                            }}
                            title="Click to copy Reference Number"
                            style={{ 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: copiedRef === log.reference_no ? '#10b981' : 'var(--primary)',
                              fontWeight: '700',
                              transition: 'color 0.2s ease'
                            }}
                          >
                            {log.reference_no || '-'}
                            {log.reference_no && (
                              copiedRef === log.reference_no ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={10} style={{ opacity: 0.5 }} />
                              )
                            )}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className="status-badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 800 }}>
                            {log.warehouse_name || 'Generic'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{renderOperatorEmail(log.operator_email)}</td>
                        <td style={{ padding: '12px 16px', fontWeight: '700' }}>{log.outward_vehicle_no}</td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_invoice_no != null && String(log.outward_invoice_no).trim() !== '' ? log.outward_invoice_no : '-'}</td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_mens_power != null && log.outward_mens_power !== '' ? log.outward_mens_power : '-'}</td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_client_name}</td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_dock_no || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_vehicle_temp}°C</td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_material_temp}°C</td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_pallets_in_qty || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700 }}>
                            {formatDuration(log.outward_loading_duration_hours, log.outward_loading_duration_mins)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                            <div>S: {log.outward_loading_start_time || '-'}</div>
                            <div>E: {log.outward_loading_end_time || '-'}</div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{log.outward_loading_supervisor_name}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {renderSaLogActions('outward', log)}
                        </td>
                      </tr>
                       )
                    })}
                        </tbody>
                      </table>
                    </div>
                    <PaginationBar
                      page={historyPage}
                      totalItems={historyTotal}
                      pageSize={historyPerPage}
                      onPageChange={setHistoryPage}
                      itemLabel="entries"
                    />
                  </>
                )}
              </section>
            </div>
          </div>
        )}

        {/* --- Menu: Profile lookup (search by reference, detail modal, SA edit) --- */}
        {activeMenu === 'profile_lookup' && (
          <div className="sa-op-gmail sa-lookup">
            {searchedRecord ? (
              <div className="do-gmail-view sa-lookup-detail">
                <section className="do-gmail-panel">
                  <div className="do-gmail-toolbar">
                    <div className="do-gmail-toolbar-left">
                      <button
                        type="button"
                        className="do-gmail-icon-btn"
                        title="Back"
                        onClick={() => {
                          setSearchedRecord(null);
                          setRecordAllowHistory([]);
                        }}
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <span className="do-gmail-avatar">
                        {String(
                          searchedRecord.client_name ||
                          searchedRecord.inward_client_name ||
                          searchedRecord.outward_client_name ||
                          searchedRecordType ||
                          'LG'
                        )
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join('') || 'LG'}
                      </span>
                      <div>
                        <h2 className="do-gmail-title">
                          {searchedRecord.reference_no || 'Log Profile'}
                        </h2>
                        <p className="do-gmail-sub">
                          {(searchedRecordType === 'daily' && 'Chamber Temp') ||
                            (searchedRecordType === 'inward' && 'Inward') ||
                            (searchedRecordType === 'outward' && 'Outward') ||
                            'Log'}
                          {' · '}
                          {searchedRecord.warehouse_name ||
                            searchedRecord.chamber_name ||
                            searchedRecord.inward_client_name ||
                            searchedRecord.outward_client_name ||
                            'Detail view'}
                        </p>
                      </div>
                    </div>
                    <div className="do-gmail-toolbar-left">
                      <button
                        type="button"
                        className="do-gmail-text-btn"
                        onClick={() => startSaEditLog(searchedRecordType || 'daily', searchedRecord)}
                      >
                        <Edit size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        className="do-gmail-text-btn danger"
                        onClick={async () => {
                          await handleSaDeleteLog(searchedRecordType || 'daily', searchedRecord);
                          setSearchedRecord(null);
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>

                <div className="profile-modal-body sa-lookup-body">
                  {/* Left Column: Data Fields */}
                  <div className="profile-details-section">
                    {searchedRecordType !== 'daily' && (
                      <div className="profile-group-card">
                        <div className="profile-group-title">Metadata & Warehouse</div>
                        <div className="profile-grid-list">
                          <div className="profile-item">
                            <span className="profile-label">Warehouse Facility</span>
                            <span className="profile-value">{searchedRecord.warehouse_name || '-'}</span>
                          </div>
                          <div className="profile-item">
                            <span className="profile-label">Recorded By Operator</span>
                            <span className="profile-value">{renderOperatorEmail(searchedRecord.operator_email)}</span>
                          </div>
                          <div className="profile-item">
                            <span className="profile-label">Created Time</span>
                            <span className="profile-value">{formatDateTimeStr(searchedRecord.created_at || searchedRecord.inward_created_at || searchedRecord.outward_created_at)}</span>
                          </div>
                          <div className="profile-item">
                            <span className="profile-label">Last Updated Time</span>
                            <span
                              className="profile-value"
                              style={
                                formatUpdatedAtStr(
                                  searchedRecord.created_at || searchedRecord.inward_created_at || searchedRecord.outward_created_at,
                                  searchedRecord.updated_at || searchedRecord.inward_updated_at || searchedRecord.outward_updated_at
                                ) !== '-'
                                  ? { color: '#0284c7', fontWeight: '800' }
                                  : undefined
                              }
                            >
                              {formatUpdatedAtStr(
                                searchedRecord.created_at || searchedRecord.inward_created_at || searchedRecord.outward_created_at,
                                searchedRecord.updated_at || searchedRecord.inward_updated_at || searchedRecord.outward_updated_at
                              )}
                            </span>
                          </div>
                          {(Number(searchedRecord.update_count) > 0 || searchedRecord.update_details) && (
                            <div className="profile-item" style={{ gridColumn: 'span 2' }}>
                              <span className="profile-label" style={{ color: 'var(--primary)', fontWeight: '800' }}>Last Updated Details</span>
                              <span className="profile-value" style={{ fontWeight: '700', color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>
                                Changed {Number(searchedRecord.update_count) > 0 ? searchedRecord.update_count : 1} {Number(searchedRecord.update_count) === 1 ? 'time' : 'times'}
                              </span>
                              {searchedRecord.update_details
                                ? renderUpdateDetailsReadable(searchedRecord.update_details)
                                : null}
                            </div>
                          )}
                          {searchedRecord.remarks || searchedRecord.inward_remarks || searchedRecord.outward_remarks ? (
                            <div className="profile-item" style={{ gridColumn: 'span 2' }}>
                              <span className="profile-label">Remarks</span>
                              <span className="profile-value profile-value-remarks">
                                {searchedRecord.remarks || searchedRecord.inward_remarks || searchedRecord.outward_remarks}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}

                    {searchedRecordType === 'daily' && renderChamberLogFormView(searchedRecord, { enableCopyRef: true })}

                    {renderSuperAllowSection(searchedRecord)}

                    {searchedRecordType === 'inward' && (
                      <>
                        <div className="profile-group-card">
                          <div className="profile-group-title">Vehicle & General Information</div>
                          <div className="profile-grid-list">
                            <div className="profile-item">
                              <span className="profile-label">Date</span>
                              <span className="profile-value">{formatDateStr(searchedRecord.inward_entry_date)}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Reference No</span>
                              <span 
                                className="profile-value"
                                onClick={() => {
                                  if (searchedRecord.reference_no) {
                                    navigator.clipboard.writeText(searchedRecord.reference_no);
                                    setCopiedRef(searchedRecord.reference_no);
                                    setTimeout(() => setCopiedRef(null), 1500);
                                  }
                                }}
                                title="Click to copy Reference Number"
                                style={{ 
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  color: copiedRef === searchedRecord.reference_no ? '#10b981' : 'var(--text-dark)',
                                  transition: 'color 0.2s ease'
                                }}
                              >
                                {searchedRecord.reference_no || '-'}
                                {searchedRecord.reference_no && (
                                  copiedRef === searchedRecord.reference_no ? (
                                    <Check size={12} color="#10b981" />
                                  ) : (
                                    <Copy size={10} style={{ opacity: 0.5 }} />
                                  )
                                )}
                              </span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Vehicle Number</span>
                              <span className="profile-value">{searchedRecord.inward_vehicle_no}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Client Name</span>
                              <span className="profile-value">{searchedRecord.inward_client_name}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Dock Number</span>
                              <span className="profile-value">{searchedRecord.inward_dock_no || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Seal Number</span>
                              <span className="profile-value">{searchedRecord.inward_seal_no || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Invoice No.</span>
                              <span className="profile-value">{searchedRecord.inward_invoice_no != null && String(searchedRecord.inward_invoice_no).trim() !== '' ? searchedRecord.inward_invoice_no : '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Mens Power</span>
                              <span className="profile-value">{searchedRecord.inward_mens_power != null && searchedRecord.inward_mens_power !== '' ? searchedRecord.inward_mens_power : '-'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="profile-group-card">
                          <div className="profile-group-title">Temperature & Logistics Details</div>
                          <div className="profile-grid-list">
                            <div className="profile-item">
                              <span className="profile-label">Vehicle Temp</span>
                              <span className="profile-value">{searchedRecord.inward_vehicle_temp !== null ? `${searchedRecord.inward_vehicle_temp}°C` : '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Material Temp</span>
                              <span className="profile-value">{searchedRecord.inward_material_temp !== null ? `${searchedRecord.inward_material_temp}°C` : '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Pallets In Quantity</span>
                              <span className="profile-value">{searchedRecord.inward_pallets_in_qty || '0'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Material Type</span>
                              <span className="profile-value">{searchedRecord.inward_material_type || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Unloading Supervisor</span>
                              <span className="profile-value">{searchedRecord.inward_unloading_supervisor_name || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Unloading Duration</span>
                            <span className="profile-value">
                              <strong>{formatDuration(searchedRecord.inward_unloading_duration_hours, searchedRecord.inward_unloading_duration_mins)}</strong>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {searchedRecord.inward_unloading_start_time || '-'}</div>
                                <div>E: {searchedRecord.inward_unloading_end_time || '-'}</div>
                              </div>
                            </span>
                            </div>
                          </div>
                        </div>

                        <div className="profile-group-card">
                          <div className="profile-group-title">Transporter & Quantities</div>
                          <div className="profile-grid-list">
                            <div className="profile-item">
                              <span className="profile-label">Transporter</span>
                              <span className="profile-value">{searchedRecord.inward_transporter_name || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Driver Name</span>
                              <span className="profile-value">{searchedRecord.inward_driver_name || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Driver Phone</span>
                              <span className="profile-value">{searchedRecord.inward_driver_no || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Invoice / Received Qty</span>
                              <span className="profile-value">{searchedRecord.inward_invoice_qty || '0'} / {searchedRecord.inward_received_qty || '0'}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {searchedRecordType === 'outward' && (
                      <>
                        <div className="profile-group-card">
                          <div className="profile-group-title">Vehicle & General Information</div>
                          <div className="profile-grid-list">
                            <div className="profile-item">
                              <span className="profile-label">Date</span>
                              <span className="profile-value">{formatDateStr(searchedRecord.outward_entry_date)}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Reference No</span>
                              <span 
                                className="profile-value"
                                onClick={() => {
                                  if (searchedRecord.reference_no) {
                                    navigator.clipboard.writeText(searchedRecord.reference_no);
                                    setCopiedRef(searchedRecord.reference_no);
                                    setTimeout(() => setCopiedRef(null), 1500);
                                  }
                                }}
                                title="Click to copy Reference Number"
                                style={{ 
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  color: copiedRef === searchedRecord.reference_no ? '#10b981' : 'var(--text-dark)',
                                  transition: 'color 0.2s ease'
                                }}
                              >
                                {searchedRecord.reference_no || '-'}
                                {searchedRecord.reference_no && (
                                  copiedRef === searchedRecord.reference_no ? (
                                    <Check size={12} color="#10b981" />
                                  ) : (
                                    <Copy size={10} style={{ opacity: 0.5 }} />
                                  )
                                )}
                              </span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Vehicle Number</span>
                              <span className="profile-value">{searchedRecord.outward_vehicle_no}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Client Name</span>
                              <span className="profile-value">{searchedRecord.outward_client_name}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Dock Number</span>
                              <span className="profile-value">{searchedRecord.outward_dock_no || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Seal Number</span>
                              <span className="profile-value">{searchedRecord.outward_seal_no || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Invoice No.</span>
                              <span className="profile-value">{searchedRecord.outward_invoice_no != null && String(searchedRecord.outward_invoice_no).trim() !== '' ? searchedRecord.outward_invoice_no : '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Mens Power</span>
                              <span className="profile-value">{searchedRecord.outward_mens_power != null && searchedRecord.outward_mens_power !== '' ? searchedRecord.outward_mens_power : '-'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="profile-group-card">
                          <div className="profile-group-title">Temperature & Logistics Details</div>
                          <div className="profile-grid-list">
                            <div className="profile-item">
                              <span className="profile-label">Pre-Cooling Temp</span>
                              <span className="profile-value">{searchedRecord.outward_pre_vehicle_temp !== null ? `${searchedRecord.outward_pre_vehicle_temp}°C` : '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Loading Temp</span>
                              <span className="profile-value">{searchedRecord.outward_vehicle_temp !== null ? `${searchedRecord.outward_vehicle_temp}°C` : '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Material Temp</span>
                              <span className="profile-value">{searchedRecord.outward_material_temp !== null ? `${searchedRecord.outward_material_temp}°C` : '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Pallets Out Quantity</span>
                              <span className="profile-value">{searchedRecord.outward_pallets_in_qty || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Material Type</span>
                              <span className="profile-value">{searchedRecord.outward_material_type || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Loading Supervisor</span>
                              <span className="profile-value">{searchedRecord.outward_loading_supervisor_name || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Loading Duration</span>
                            <span className="profile-value">
                              <strong>{formatDuration(searchedRecord.outward_loading_duration_hours, searchedRecord.outward_loading_duration_mins)}</strong>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {searchedRecord.outward_loading_start_time || '-'}</div>
                                <div>E: {searchedRecord.outward_loading_end_time || '-'}</div>
                              </div>
                            </span>
                            </div>
                          </div>
                        </div>

                        <div className="profile-group-card">
                          <div className="profile-group-title">Transporter & Quantities</div>
                          <div className="profile-grid-list">
                            <div className="profile-item">
                              <span className="profile-label">Transporter</span>
                              <span className="profile-value">{searchedRecord.outward_transporter_name || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Driver Name</span>
                              <span className="profile-value">{searchedRecord.outward_driver_name || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Driver Phone</span>
                              <span className="profile-value">{searchedRecord.outward_driver_no || '-'}</span>
                            </div>
                            <div className="profile-item">
                              <span className="profile-label">Invoice / Loaded Qty</span>
                              <span className="profile-value">{searchedRecord.outward_invoice_qty || '0'} / {searchedRecord.outward_received_qty || '0'}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {(searchedRecordType === 'inward' || searchedRecordType === 'outward') &&
                      renderPhotoCaptureMetadataPanel(searchedRecord.photo_capture_metadata)}
                  </div>

                  {/* Right Column: Photos Gallery */}
                  <div className="profile-photos-section do-gmail-panel sa-lookup-photos">
                    <div className="do-gmail-section-label">Uploaded attachments</div>

                    {((searchedRecordType === 'daily' && searchedRecord.temp_sensor_image) ||
                      (searchedRecordType === 'inward' && (
                        searchedRecord.inward_invoice_photos ||
                        searchedRecord.inward_pod_photo ||
                        searchedRecord.inward_vehicle_seal_photo ||
                        searchedRecord.inward_vehicle_temp_photo ||
                        searchedRecord.inward_material_temp_photo ||
                        searchedRecord.inward_vehicle_back_side_photo ||
                        searchedRecord.inward_vehicle_back_side_photo_with_material ||
                        searchedRecord.inward_count_sheet_photo ||
                        searchedRecord.inward_damage_boxes_photo
                      )) ||
                      (searchedRecordType === 'outward' && (
                        searchedRecord.outward_invoice_photos ||
                        searchedRecord.outward_pod_photo ||
                        searchedRecord.outward_vehicle_seal_photo ||
                        searchedRecord.outward_vehicle_temp_photo ||
                        searchedRecord.outward_pre_vehicle_temp_photo ||
                        searchedRecord.outward_material_temp_photo ||
                        searchedRecord.outward_vehicle_back_side_photo ||
                        searchedRecord.outward_vehicle_back_side_photo_with_material ||
                        searchedRecord.outward_count_sheet_photo ||
                        searchedRecord.outward_damage_boxes_photo
                      ))) ? (
                      <div className="profile-photo-grid">
                        {searchedRecordType === 'daily' && searchedRecord.temp_sensor_image && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.temp_sensor_image))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(searchedRecord.temp_sensor_image)} alt="Temp Sensor" />
                            </div>
                            <div className="profile-photo-label">Temp Sensor</div>
                          </div>
                        )}

                        {searchedRecordType === 'inward' && (
                          <>
                            {searchedRecord.inward_invoice_photos && searchedRecord.inward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                              <div key={`siinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(img)} alt={`Invoice ${idx + 1}`} />
                                </div>
                                <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                              </div>
                            ))}
                            {searchedRecord.inward_pod_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.inward_pod_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.inward_pod_photo)} alt="POD" />
                                </div>
                                <div className="profile-photo-label">POD Photo</div>
                              </div>
                            )}
                            {searchedRecord.inward_vehicle_seal_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.inward_vehicle_seal_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.inward_vehicle_seal_photo)} alt="Seal" />
                                </div>
                                <div className="profile-photo-label">Vehicle Seal</div>
                              </div>
                            )}
                            {searchedRecord.inward_vehicle_temp_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.inward_vehicle_temp_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.inward_vehicle_temp_photo)} alt="Temp" />
                                </div>
                                <div className="profile-photo-label">Vehicle Temp</div>
                              </div>
                            )}
                            {searchedRecord.inward_material_temp_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.inward_material_temp_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.inward_material_temp_photo)} alt="Material Temp" />
                                </div>
                                <div className="profile-photo-label">Material Temp</div>
                              </div>
                            )}
                            {searchedRecord.inward_vehicle_back_side_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.inward_vehicle_back_side_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.inward_vehicle_back_side_photo)} alt="Back" />
                                </div>
                                <div className="profile-photo-label">Vehicle Back</div>
                              </div>
                            )}
                            {searchedRecord.inward_vehicle_back_side_photo_with_material && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.inward_vehicle_back_side_photo_with_material))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.inward_vehicle_back_side_photo_with_material)} alt="Back Loaded" />
                                </div>
                                <div className="profile-photo-label">Vehicle Loaded</div>
                              </div>
                            )}
                            {searchedRecord.inward_count_sheet_photo && searchedRecord.inward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                              <div key={`sics-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(img)} alt={`Count Sheet ${idx + 1}`} />
                                </div>
                                <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                              </div>
                            ))}
                            {searchedRecord.inward_damage_boxes_photo && searchedRecord.inward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
                              <div key={idx} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(dmgImg))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(dmgImg)} alt="Damage" />
                                </div>
                                <div className="profile-photo-label">Damage #{idx + 1}</div>
                              </div>
                            ))}
                          </>
                        )}

                        {searchedRecordType === 'outward' && (
                          <>
                            {searchedRecord.outward_invoice_photos && searchedRecord.outward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                              <div key={`soinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(img)} alt={`Invoice ${idx + 1}`} />
                                </div>
                                <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                              </div>
                            ))}
                            {searchedRecord.outward_pod_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.outward_pod_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.outward_pod_photo)} alt="POD" />
                                </div>
                                <div className="profile-photo-label">POD Photo</div>
                              </div>
                            )}
                            {searchedRecord.outward_vehicle_seal_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.outward_vehicle_seal_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.outward_vehicle_seal_photo)} alt="Seal" />
                                </div>
                                <div className="profile-photo-label">Vehicle Seal</div>
                              </div>
                            )}
                            {searchedRecord.outward_pre_vehicle_temp_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.outward_pre_vehicle_temp_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.outward_pre_vehicle_temp_photo)} alt="Pre Temp" />
                                </div>
                                <div className="profile-photo-label">Pre-Cooling Temp</div>
                              </div>
                            )}
                            {searchedRecord.outward_vehicle_temp_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.outward_vehicle_temp_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.outward_vehicle_temp_photo)} alt="Temp" />
                                </div>
                                <div className="profile-photo-label">Vehicle Temp</div>
                              </div>
                            )}
                            {searchedRecord.outward_material_temp_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.outward_material_temp_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.outward_material_temp_photo)} alt="Material Temp" />
                                </div>
                                <div className="profile-photo-label">Material Temp</div>
                              </div>
                            )}
                            {searchedRecord.outward_vehicle_back_side_photo && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.outward_vehicle_back_side_photo))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.outward_vehicle_back_side_photo)} alt="Back" />
                                </div>
                                <div className="profile-photo-label">Vehicle Back</div>
                              </div>
                            )}
                            {searchedRecord.outward_vehicle_back_side_photo_with_material && (
                              <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(searchedRecord.outward_vehicle_back_side_photo_with_material))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(searchedRecord.outward_vehicle_back_side_photo_with_material)} alt="Back Loaded" />
                                </div>
                                <div className="profile-photo-label">Vehicle Loaded</div>
                              </div>
                            )}
                            {searchedRecord.outward_count_sheet_photo && searchedRecord.outward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                              <div key={`socs-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(img)} alt={`Count Sheet ${idx + 1}`} />
                                </div>
                                <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                              </div>
                            ))}
                            {searchedRecord.outward_damage_boxes_photo && searchedRecord.outward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
                              <div key={idx} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(dmgImg))}>
                                <div className="profile-photo-wrapper">
                                  <img src={toMediaSrc(dmgImg)} alt="Damage" />
                                </div>
                                <div className="profile-photo-label">Damage #{idx + 1}</div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="sa-op-empty">
                        No audit attachment photos uploaded for this record.
                      </div>
                    )}
                  </div>
                </div>
                </section>
              </div>
            ) : (
              <section className="sa-op-card sa-op-directory">
                <div className="sa-op-dir-toolbar">
                  <div>
                    <h2 className="sa-op-title">Log Profile Lookup</h2>
                    <p className="sa-op-sub">
                      Search Daily Chamber, Inward, and Outward profiles by Ref No, vehicle, client, or supervisor
                    </p>
                  </div>
                  <div className="sa-op-dir-tools">
                    <label className="sa-op-search" style={{ width: 'min(52vw, 360px)', minWidth: 'min(100%, 220px)' }}>
                      <Search size={14} />
                      <input
                        type="search"
                        placeholder="Ref No, vehicle, client, supervisor…"
                        value={lookupQuery}
                        onChange={(e) => setLookupQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleLookupSearch();
                        }}
                      />
                    </label>
                    <button type="button" className="sa-op-btn-primary" onClick={handleLookupSearch}>
                      Search
                    </button>
                  </div>
                </div>

                {searchResults.length === 0 ? (
                  <div className="sa-op-empty">
                    <Search size={28} />
                    <p>Enter a Ref No, vehicle plate, or client name to find profiles.</p>
                  </div>
                ) : (
                  <div className="sa-op-inbox">
                    <div className="sa-op-dir-toolbar" style={{ borderBottom: '1px solid #e0e0e0', minHeight: 36 }}>
                      <p className="sa-op-sub" style={{ margin: 0 }}>
                        {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
                      </p>
                    </div>
                    {searchResults.map((res, index) => {
                      const initials = String(res.client || res.label || 'LG')
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join('') || 'LG';
                      return (
                        <div key={index} className="sa-op-inbox-row">
                          <button
                            type="button"
                            className="sa-op-inbox-main"
                            onClick={() => {
                              setSearchedRecord(res.original);
                              setSearchedRecordType(res.type);
                              loadRecordAllowHistory(res.type, res.original);
                            }}
                            title="Open profile"
                          >
                            <span className="sa-op-avatar">{initials}</span>
                            <span className="sa-op-sender">
                              <strong>{res.reference_no || `No Ref · ${res.date || '—'}`}</strong>
                              <em>{res.label}</em>
                            </span>
                            <span className="sa-op-snippet">
                              {res.client || '—'}
                              {' · '}
                              {res.facility || '—'}
                              {res.details ? ` · ${res.details}` : ''}
                            </span>
                            <span className="sa-op-date">{res.date || '—'}</span>
                          </button>
                          <div className="sa-op-row-actions">
                            <button
                              type="button"
                              className="sa-op-icon-btn"
                              title="Open"
                              onClick={() => {
                                setSearchedRecord(res.original);
                                setSearchedRecordType(res.type);
                                loadRecordAllowHistory(res.type, res.original);
                              }}
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* --- Menu: Activity logs (DO actions, security audit, permission config) --- */}
        {activeMenu === 'activity_logs' && (
          <div className="sa-um sa-activity">
            <div className="sa-gmail-tabs sa-gmail-tabs-wrap">
              <button
                type="button"
                className={`sa-gmail-tab${auditSubTab === 'activity_log' ? ' active' : ''}`}
                onClick={() => setAuditSubTab('activity_log')}
              >
                <Activity size={14} />
                Activity Audit
              </button>
              <button
                type="button"
                className={`sa-gmail-tab${auditSubTab === 'do_changes' ? ' active' : ''}`}
                onClick={() => setAuditSubTab('do_changes')}
              >
                DO Operations
                {hasNewDOChanges ? <span className="pulsing-dot" style={{ position: 'relative', top: 'auto', right: 'auto' }} /> : null}
              </button>
              <button
                type="button"
                className={`sa-gmail-tab${auditSubTab === 'security_log' ? ' active' : ''}`}
                onClick={() => setAuditSubTab('security_log')}
              >
                <ShieldCheck size={14} />
                Security
              </button>
              <button
                type="button"
                className={`sa-gmail-tab${auditSubTab === 'system_errors' ? ' active' : ''}`}
                onClick={() => setAuditSubTab('system_errors')}
              >
                System & Errors
              </button>
              <button
                type="button"
                className={`sa-gmail-tab${auditSubTab === 'permission_log' ? ' active' : ''}`}
                onClick={() => setAuditSubTab('permission_log')}
              >
                <Lock size={14} />
                Permissions
                {hasPendingRequests ? <span className="pulsing-dot" style={{ position: 'relative', top: 'auto', right: 'auto' }} /> : null}
              </button>
            </div>

            <div className="sa-op-gmail">
              <section className="sa-op-card sa-op-directory">
                <div className="sa-op-dir-toolbar">
                  <div>
                    <h2 className="sa-op-title">
                      {auditSubTab === 'activity_log' ? 'Operator Activity Audit Logs' :
                       auditSubTab === 'security_log' ? 'System Security & Access Logs' :
                       auditSubTab === 'system_errors' ? 'System Process & Error Logs' :
                       auditSubTab === 'do_changes' ? 'DO Client & Chamber Actions Log' :
                       'Role & Permission Requests'}
                    </h2>
                    <p className="sa-op-sub">
                      {auditSubTab === 'activity_log' ? 'Real-time database operations audit trail' :
                       auditSubTab === 'security_log' ? 'Authentication events & security access logs' :
                       auditSubTab === 'system_errors' ? 'Application processes and runtime exception logs' :
                       auditSubTab === 'do_changes' ? 'Master Setup, client/chamber changes and Super Admin allow decisions' :
                       'Role authorizations, edit/delete permission settings & approvals'}
                    </p>
                  </div>
                  <div className="sa-op-dir-tools">
                    <select
                      className="sa-op-filter"
                      value={selectedWarehouseFilter}
                      onChange={(e) => {
                        setSelectedWarehouseFilter(e.target.value);
                        setActivitiesCurrentPage(1);
                      }}
                      title="Warehouse filter"
                    >
                      <option value="All">All Warehouses</option>
                      {warehousesList.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                      <option value="System/Admin">System / Admin Logs</option>
                    </select>
                    <button
                      type="button"
                      className="sa-op-btn-text"
                      onClick={loadActivities}
                      disabled={loadingActivities}
                    >
                      {loadingActivities ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                </div>

            {logsError && (
              <div className="sa-op-banner-wrap">
              <LoadErrorBanner
                message={logsError}
                onRetry={() => {
                  if (auditSubTab === 'permission_log') loadPermissionRequests();
                  else if (auditSubTab === 'system_errors') loadSystemConfig();
                  else loadActivities();
                }}
                onDismiss={() => setLogsError('')}
              />
              </div>
            )}

            { (auditSubTab === 'activity_log' || auditSubTab === 'do_changes') ? (
              // Tab 1: Operator Activity History Audit Logs & DO Operations Log
              (() => {
                const paginatedActivities = activities || [];
                const totalItems = activitiesTotal;
                const currentPage = activitiesCurrentPage;

                return (
                  <div className="sa-activity-panel">
                    <div className="sa-op-dir-tools sa-activity-filters">
                      <label className="sa-op-search">
                        <Search size={14} />
                        <input
                          type="search"
                          placeholder="Search email, action, description…"
                          value={activitiesSearch}
                          onChange={(e) => {
                            setActivitiesSearch(e.target.value);
                            setActivitiesCurrentPage(1);
                          }}
                        />
                      </label>
                      <select
                        className="sa-op-filter"
                        value={activitiesActionFilter}
                        onChange={(e) => {
                          setActivitiesActionFilter(e.target.value);
                          setActivitiesCurrentPage(1);
                        }}
                      >
                          <option value="All">All Actions</option>
                          {auditSubTab === 'do_changes' ? (
                            <>
                              <option value="MASTER_SETUP">MASTER_SETUP</option>
                              <option value="ADD_CLIENT">ADD_CLIENT</option>
                              <option value="DELETE_CLIENT">DELETE_CLIENT</option>
                              <option value="UPDATE_CLIENT">UPDATE_CLIENT</option>
                              <option value="ADD_CHAMBER">ADD_CHAMBER</option>
                              <option value="DELETE_CHAMBER">DELETE_CHAMBER</option>
                              <option value="UPDATE_CHAMBER_ZONE">UPDATE_CHAMBER_ZONE</option>
                              <option value="REQUEST_EDIT">REQUEST_EDIT</option>
                              <option value="REQUEST_DELETE">REQUEST_DELETE</option>
                              <option value="GRANT_PERMISSION">GRANT (Allow Edit)</option>
                              <option value="GRANT_DELETE">GRANT (Allow Delete)</option>
                              <option value="DENY_PERMISSION">DENY Edit</option>
                              <option value="DENY_DELETE">DENY Delete</option>
                            </>
                          ) : (
                            <>
                              <option value="CREATE">CREATE</option>
                              <option value="UPDATE">UPDATE</option>
                              <option value="DELETE">DELETE</option>
                              <option value="LOGIN">LOGIN</option>
                              <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                              <option value="REQUEST_EDIT">REQUEST_EDIT</option>
                              <option value="REQUEST_DELETE">REQUEST_DELETE</option>
                              <option value="GRANT_PERMISSION">GRANT_PERMISSION</option>
                              <option value="DENY_PERMISSION">DENY_PERMISSION</option>
                            </>
                          )}
                      </select>
                      <input
                        className="sa-op-filter"
                        type="date"
                        value={activitiesFromDate}
                        max={activitiesToDate || undefined}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActivitiesFromDate(val);
                          if (val && activitiesToDate && val > activitiesToDate) {
                            setActivitiesToDate(val);
                          }
                          setActivitiesCurrentPage(1);
                        }}
                        title="From date"
                      />
                      <input
                        className="sa-op-filter"
                        type="date"
                        value={activitiesToDate}
                        min={activitiesFromDate || undefined}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActivitiesToDate(val);
                          if (val && activitiesFromDate && val < activitiesFromDate) {
                            setActivitiesFromDate(val);
                          }
                          setActivitiesCurrentPage(1);
                        }}
                        title="To date"
                      />
                      <button type="button" className="sa-op-btn-export" onClick={handleExportActivitiesExcel}>
                        <Download size={14} />
                        <span>Export</span>
                      </button>
                      {(activitiesSearch || activitiesFromDate || activitiesToDate || activitiesActionFilter !== 'All') && (
                        <button
                          type="button"
                          className="sa-op-btn-text"
                          onClick={() => {
                            setActivitiesSearch('');
                            setActivitiesFromDate('');
                            setActivitiesToDate('');
                            setActivitiesActionFilter('All');
                            setActivitiesCurrentPage(1);
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {exportError?.retryKey === 'activities' && (
                      <div className="sa-op-banner-wrap">
                      <ExportErrorBanner
                        message={exportError.message}
                        retryable={exportError.retryable}
                        onRetry={retryFailedExport}
                        onDismiss={() => setExportError(null)}
                      />
                      </div>
                    )}

                    {loadingActivities ? (
                      <SaDataLoading label="Loading activity history logs…" />
                    ) : paginatedActivities.length === 0 ? (
                      <div className="sa-op-empty">No operator activities found matching the filters.</div>
                    ) : (
                      <>
                        <div style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                          <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-main)' }}>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>DO Name / Email</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Decided by (Name / Email)</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Warehouse</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Action</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Module/Log</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Activity Description</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Remark</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Timestamp</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedActivities.map((act) => {
                                if (!act) return null;
                                let actionColor = '#3b82f6';
                                if (act.action === 'CREATE' || act.action === 'ADD_CLIENT' || act.action === 'ADD_CHAMBER' || act.action === 'GRANT_PERMISSION' || act.action === 'GRANT_DELETE' || act.action === 'MASTER_SETUP') {
                                  actionColor = '#10b981';
                                } else if (act.action === 'DELETE' || act.action === 'DELETE_CLIENT' || act.action === 'DELETE_CHAMBER' || act.action === 'DENY_PERMISSION' || act.action === 'DENY_DELETE') {
                                  actionColor = '#ef4444';
                                } else if (act.action === 'REQUEST_EDIT' || act.action === 'REQUEST_DELETE' || act.action === 'UPDATE_CLIENT' || act.action === 'UPDATE_CHAMBER_ZONE') {
                                  actionColor = '#a16207';
                                }

                                const isMasterRow = MASTER_SETUP_ACTIONS.has(String(act.action || '').toUpperCase());
                                const isDecisionAction = ['GRANT_PERMISSION', 'GRANT_DELETE', 'DENY_PERMISSION', 'DENY_DELETE'].includes(
                                  String(act.action || '')
                                );

                                return (
                                  <tr key={act.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: '700', color: '#0f172a' }}>{renderOperatorEmail(act.operator_email)}</td>
                                    <td style={{ padding: '6px 8px' }}>
                                      {isDecisionAction
                                        ? renderDecidedByCell(act)
                                        : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '6px 8px', color: '#475569', fontWeight: 600 }}>
                                      {operatorWarehouseMap[act.operator_email ? act.operator_email.toLowerCase() : ''] || 'System / Admin'}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <span style={{
                                        fontSize: '0.64rem',
                                        fontWeight: '800',
                                        color: actionColor,
                                        textTransform: 'uppercase'
                                      }}>
                                        {act.action}
                                      </span>
                                    </td>
                                    <td style={{ padding: '6px 8px', fontWeight: '700', color: '#475569' }}>{isMasterRow ? 'Master Setup' : act.log_type}</td>
                                    <td style={{ padding: '6px 8px', color: '#334155' }}>
                                      {isMasterRow ? renderMasterActivityStructured(act, { compact: true }) : (() => {
                                        const refRegex = /\(Ref:\s*(RF-[A-Z]+-\d+-\d+)\)/i;
                                        const descStr = String(act.description || '');
                                        const match = descStr.match(refRegex);
                                        if (match) {
                                          const refNo = match[1];
                                          const parts = descStr.split(match[0]);
                                          return (
                                            <span>
                                              {highlightAddedDeletedWords(parts[0])}
                                              <span 
                                                onClick={() => showLogDetailsByRef(refNo, act.permission_req, act.log_type)}
                                                style={{ 
                                                  color: 'var(--primary)', 
                                                  fontWeight: '800', 
                                                  cursor: 'pointer', 
                                                  textDecoration: 'underline'
                                                }}
                                                title="Click to view data profile"
                                              >
                                                {refNo}
                                              </span>
                                              {highlightAddedDeletedWords(parts[1])}
                                            </span>
                                          );
                                        }
                                        return highlightAddedDeletedWords(descStr);
                                      })()}
                                    </td>
                                    <td style={{ padding: '6px 8px', color: '#0f766e', fontWeight: 600, fontSize: '0.72rem', maxWidth: 180 }}>
                                      {act.remark || '—'}
                                    </td>
                                    <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '0.72rem' }}>
                                      {new Date(act.created_at).toLocaleString('en-GB', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true
                                      })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <PaginationBar
                          page={currentPage}
                          totalItems={totalItems}
                          pageSize={activitiesPerPage}
                          onPageChange={setActivitiesCurrentPage}
                          itemLabel="entries"
                        />
                      </>
                    )}
                  </div>
                );
              })()
            ) : auditSubTab === 'security_log' ? (
              // Tab 2: System Security & Permission Logs
              (() => {
                const paginatedSecurityLogs = activities || [];
                const totalItems = activitiesTotal;
                const currentPage = securityCurrentPage;

                return (
                  <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--text-dark)' }}>Recent Permission & Role Access Logs</h3>
                    
                    {/* Search & Filter Controls */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      alignItems: 'flex-end',
                      padding: '16px',
                      backgroundColor: 'var(--bg-main)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      marginBottom: '16px'
                    }}>
                      {/* 1. Search Query */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 200px', minWidth: '200px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>Search Query</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            placeholder="Search user, action, desc..."
                            value={securitySearch}
                            onChange={(e) => {
                              setSecuritySearch(e.target.value);
                              setSecurityCurrentPage(1);
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px 8px 32px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                              fontSize: '0.8rem',
                              color: 'var(--text-dark)',
                              backgroundColor: '#ffffff',
                              outline: 'none'
                            }}
                          />
                          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        </div>
                      </div>

                      {/* 2. Action Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 160px', minWidth: '160px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>Action Type</label>
                        <select
                          value={securityActionFilter}
                          onChange={(e) => {
                            setSecurityActionFilter(e.target.value);
                            setSecurityCurrentPage(1);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            color: 'var(--text-dark)',
                            backgroundColor: '#ffffff',
                            outline: 'none',
                            cursor: 'pointer',
                            height: '37px'
                          }}
                        >
                          <option value="All">All Actions</option>
                          <option value="LOGIN">LOGIN</option>
                          <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                          <option value="GRANT_PERMISSION">GRANT_PERMISSION</option>
                          <option value="DENY_PERMISSION">DENY_PERMISSION</option>
                          <option value="REQUEST_EDIT">REQUEST_EDIT</option>
                          <option value="REQUEST_DELETE">REQUEST_DELETE</option>
                          <option value="DELETE">DELETE</option>
                        </select>
                      </div>

                      {/* 3. From Date */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px', minWidth: '140px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>From Date</label>
                        <input
                          type="date"
                          value={securityFromDate}
                          max={securityToDate || undefined}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSecurityFromDate(val);
                            if (val && securityToDate && val > securityToDate) {
                              setSecurityToDate(val);
                            }
                            setSecurityCurrentPage(1);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            color: 'var(--text-dark)',
                            backgroundColor: '#ffffff',
                            outline: 'none',
                            height: '37px'
                          }}
                        />
                      </div>

                      {/* 4. To Date */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px', minWidth: '140px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>To Date</label>
                        <input
                          type="date"
                          value={securityToDate}
                          min={securityFromDate || undefined}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSecurityToDate(val);
                            if (val && securityFromDate && val < securityFromDate) {
                              setSecurityFromDate(val);
                            }
                            setSecurityCurrentPage(1);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            color: 'var(--text-dark)',
                            backgroundColor: '#ffffff',
                            outline: 'none',
                            height: '37px'
                          }}
                        />
                      </div>

                      {/* 5. Actions (Export & Reset) */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '37px' }}>
                        <button
                          onClick={handleExportSecurityExcel}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            backgroundColor: '#22c55e',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            height: '100%'
                          }}
                        >
                          <Download size={14} />
                          <span>Export</span>
                        </button>

                        {(securitySearch || securityFromDate || securityToDate || securityActionFilter !== 'All') && (
                          <button
                            onClick={() => {
                              setSecuritySearch('');
                              setSecurityFromDate('');
                              setSecurityToDate('');
                              setSecurityActionFilter('All');
                              setSecurityCurrentPage(1);
                            }}
                            style={{
                              padding: '8px 14px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                              backgroundColor: '#ffffff',
                              color: 'var(--text-muted)',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              height: '100%'
                            }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {exportError?.retryKey === 'security' && (
                      <ExportErrorBanner
                        message={exportError.message}
                        retryable={exportError.retryable}
                        onRetry={retryFailedExport}
                        onDismiss={() => setExportError(null)}
                      />
                    )}

                    {loadingActivities ? (
                      <SaDataLoading label="Loading security logs…" />
                    ) : paginatedSecurityLogs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                        <span>No permission or security logs found matching the filters.</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                          <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-main)' }}>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>User / Identity</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Warehouse</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Action</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Level</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Security Event Description</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Timestamp</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedSecurityLogs.map((act) => {
                                if (!act) return null;
                                let actionColor = '#ea580c';
                                let actionBg = '#ffedd5';
                                if (act.action === 'LOGIN') {
                                  actionColor = '#16a34a';
                                  actionBg = '#dcfce7';
                                } else if (act.action === 'LOGIN_FAILED') {
                                  actionColor = '#dc2626';
                                  actionBg = '#fee2e2';
                                } else if (act.action === 'DELETE') {
                                  actionColor = '#dc2626';
                                  actionBg = '#fee2e2';
                                }

                                return (
                                  <tr key={act.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: '700', color: '#0f172a' }}>{renderOperatorEmail(act.operator_email)}</td>
                                    <td style={{ padding: '6px 8px', color: '#475569', fontWeight: 600 }}>
                                      {operatorWarehouseMap[act.operator_email ? act.operator_email.toLowerCase() : ''] || 'System / Admin'}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <span style={{
                                        display: 'inline-block',
                                        padding: '1px 6px',
                                        borderRadius: '100px',
                                        fontSize: '0.64rem',
                                        fontWeight: '800',
                                        color: actionColor,
                                        backgroundColor: actionBg,
                                        textTransform: 'uppercase'
                                      }}>
                                        {act.action}
                                      </span>
                                    </td>
                                    <td style={{ padding: '6px 8px', fontWeight: '700', color: act.log_type === 'SECURITY' ? '#dc2626' : '#ea580c' }}>{act.log_type}</td>
                                    <td style={{ padding: '6px 8px', color: '#334155' }}>{act.description}</td>
                                    <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '0.72rem' }}>
                                      {new Date(act.created_at).toLocaleString('en-GB', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true
                                      })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <PaginationBar
                          page={currentPage}
                          totalItems={totalItems}
                          pageSize={securityPerPage}
                          onPageChange={setSecurityCurrentPage}
                          itemLabel="entries"
                        />
                      </>
                    )}
                  </div>
                );
              })()
            ) : auditSubTab === 'system_errors' ? (
              // Tab 3: System & Error Logs
              (() => {
                const paginatedSystemLogs = activities || [];
                const totalItems = activitiesTotal;
                const currentPage = systemCurrentPage;

                return (
                  <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--text-dark)' }}>System Process & Error Logs</h3>
                    
                    {/* Search & Filter Controls */}
                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      padding: '16px',
                      backgroundColor: 'var(--bg-main)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      marginBottom: '16px'
                    }}>
                      {/* 1. Search Query */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 200px', minWidth: '200px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>Search Logs</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            placeholder="Search event, description..."
                            value={systemSearch}
                            onChange={(e) => {
                              setSystemSearch(e.target.value);
                              setSystemCurrentPage(1);
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px 8px 32px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                              fontSize: '0.8rem',
                              color: 'var(--text-dark)',
                              backgroundColor: '#ffffff',
                              outline: 'none'
                            }}
                          />
                          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        </div>
                      </div>

                      {/* 2. Action Type Filter */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 160px', minWidth: '160px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>Log Level/Event</label>
                        <select
                          value={systemActionFilter}
                          onChange={(e) => {
                            setSystemActionFilter(e.target.value);
                            setSystemCurrentPage(1);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            color: 'var(--text-dark)',
                            backgroundColor: '#ffffff',
                            outline: 'none',
                            cursor: 'pointer',
                            height: '37px'
                          }}
                        >
                          <option value="All">All Events</option>
                          <option value="SYSTEM_ERROR">SYSTEM_ERROR</option>
                          <option value="SERVER_STARTUP">SERVER_STARTUP</option>
                        </select>
                      </div>

                      {/* 3. From Date */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px', minWidth: '140px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>From Date</label>
                        <input
                          type="date"
                          value={systemFromDate}
                          max={systemToDate || undefined}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSystemFromDate(val);
                            if (val && systemToDate && val > systemToDate) {
                              setSystemToDate(val);
                            }
                            setSystemCurrentPage(1);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            color: 'var(--text-dark)',
                            backgroundColor: '#ffffff',
                            outline: 'none',
                            height: '37px'
                          }}
                        />
                      </div>

                      {/* 4. To Date */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px', minWidth: '140px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>To Date</label>
                        <input
                          type="date"
                          value={systemToDate}
                          min={systemFromDate || undefined}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSystemToDate(val);
                            if (val && systemFromDate && val < systemFromDate) {
                              setSystemFromDate(val);
                            }
                            setSystemCurrentPage(1);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            color: 'var(--text-dark)',
                            backgroundColor: '#ffffff',
                            outline: 'none',
                            height: '37px'
                          }}
                        />
                      </div>

                      {/* 5. Actions */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '37px' }}>
                        <button
                          onClick={handleExportSystemExcel}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            backgroundColor: '#22c55e',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            height: '100%'
                          }}
                        >
                          <Download size={14} />
                          <span>Export</span>
                        </button>

                        {(systemSearch || systemFromDate || systemToDate || systemActionFilter !== 'All') && (
                          <button
                            onClick={() => {
                              setSystemSearch('');
                              setSystemFromDate('');
                              setSystemToDate('');
                              setSystemActionFilter('All');
                              setSystemCurrentPage(1);
                            }}
                            style={{
                              padding: '8px 14px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                              backgroundColor: '#ffffff',
                              color: 'var(--text-muted)',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              height: '100%'
                            }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {exportError?.retryKey === 'system' && (
                      <ExportErrorBanner
                        message={exportError.message}
                        retryable={exportError.retryable}
                        onRetry={retryFailedExport}
                        onDismiss={() => setExportError(null)}
                      />
                    )}

                    {loadingActivities ? (
                      <SaDataLoading label="Loading system logs…" />
                    ) : paginatedSystemLogs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                        <span>No system or error logs found matching the filters.</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                          <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-main)' }}>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Identity / Source</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Warehouse</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Log Type</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Action Event</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Process & Error Description</th>
                                <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Timestamp</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedSystemLogs.map((act) => {
                                if (!act) return null;
                                let actionColor = '#3b82f6';
                                let actionBg = '#dbeafe';
                                if (act.log_type === 'ERROR') {
                                  actionColor = '#dc2626';
                                  actionBg = '#fee2e2';
                                } else if (act.action === 'SERVER_STARTUP') {
                                  actionColor = '#16a34a';
                                  actionBg = '#dcfce7';
                                }

                                return (
                                  <tr key={act.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: '700', color: '#0f172a' }}>{renderOperatorEmail(act.operator_email)}</td>
                                    <td style={{ padding: '6px 8px', color: '#475569', fontWeight: 600 }}>
                                      {operatorWarehouseMap[act.operator_email ? act.operator_email.toLowerCase() : ''] || 'System'}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <span style={{
                                        display: 'inline-block',
                                        padding: '1px 6px',
                                        borderRadius: '100px',
                                        fontSize: '0.64rem',
                                        fontWeight: '800',
                                        color: act.log_type === 'ERROR' ? '#ffffff' : actionColor,
                                        backgroundColor: act.log_type === 'ERROR' ? '#dc2626' : actionBg,
                                        textTransform: 'uppercase'
                                      }}>
                                        {act.log_type}
                                      </span>
                                    </td>
                                    <td style={{ padding: '6px 8px', fontWeight: '700', color: '#475569' }}>{act.action}</td>
                                    <td style={{ padding: '6px 8px' }}>{renderSystemErrorDescription(act.description, act.log_type === 'ERROR')}</td>
                                    <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                      {new Date(act.created_at).toLocaleString('en-GB', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true
                                      })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <PaginationBar
                          page={currentPage}
                          totalItems={totalItems}
                          pageSize={systemPerPage}
                          onPageChange={setSystemCurrentPage}
                          itemLabel="entries"
                        />
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              // Tab 2: Permission System Matrix & Logs
              (() => {
                const securityLogs = activities.filter(act => 
                  act.log_type === 'PERMISSION' || 
                  act.log_type === 'SECURITY'
                );

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* DO Edit & Delete Permission Requests Section */}
                    {(() => {
                      const filteredPendingRequests = filterActionablePendingPermissionRequests(
                        permissionRequests,
                        operatorWarehouseMap,
                        selectedWarehouseFilter
                      );

                      return (
                        <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Lock size={18} color="#ea580c" />
                            <span>Data Operator Edit & Delete Permission Requests</span>
                          </h3>
                          {filteredPendingRequests.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              <span>No pending edit or delete permission requests found for the selected warehouse.</span>
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-main)' }}>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Operator Email</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Warehouse</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Log Module</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Record ID</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Client Name</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Request Type</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Request Details</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Status</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-dark)' }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredPendingRequests.map((pr) => {
                                    if (!pr) return null;
                                    const parsed = parseRequestDescription(pr.description || pr.request_description, pr.record_type);
                                    const isMasterSetup = pr.record_type === 'MasterSetup';
                                    const isChamberMaster = pr.record_type === 'ChamberMaster';
                                    const isChamberType = pr.record_type === 'ChamberType' || parsed.refNo === 'TYPE';
                                    const isClientMaster = pr.record_type === 'ClientMaster';
                                    const isAllowStyle = isMasterSetup || isChamberMaster || isChamberType || isClientMaster;
                                    const badgeBg = isClientMaster
                                      ? (pr.raw_action === 'REQUEST_DELETE' ? '#fef2f2' : '#eff6ff')
                                      : isChamberType
                                        ? '#fff7ed'
                                      : isChamberMaster
                                        ? (parsed.refNo === 'ADD' ? '#eff6ff' : '#fef2f2')
                                        : (isMasterSetup ? '#f0fdf4' : '#f1f5f9');
                                    const badgeFg = isClientMaster
                                      ? (pr.raw_action === 'REQUEST_DELETE' ? '#b91c1c' : '#1d4ed8')
                                      : isChamberType
                                        ? '#c2410c'
                                      : isChamberMaster
                                        ? (parsed.refNo === 'ADD' ? '#1d4ed8' : '#b91c1c')
                                        : (isMasterSetup ? '#15803d' : '#475569');
                                    
                                    return (
                                      <tr key={pr.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: '700', color: '#0f172a' }}>{renderOperatorEmail(pr.operator_email)}</td>
                                        <td style={{ padding: '6px 8px', color: '#475569', fontWeight: 600 }}>
                                          {operatorWarehouseMap[pr.operator_email ? pr.operator_email.toLowerCase() : ''] || 'System / Admin'}
                                        </td>
                                        <td style={{ padding: '6px 8px' }}>
                                          <span className="status-badge" style={{ backgroundColor: badgeBg, color: badgeFg, fontWeight: 700 }}>
                                            {parsed.module}
                                          </span>
                                        </td>
                                        <td 
                                          style={{ padding: '6px 8px', color: isAllowStyle ? badgeFg : 'var(--primary)', fontWeight: 700, cursor: isAllowStyle ? 'default' : 'pointer', textDecoration: isAllowStyle ? 'none' : 'underline' }}
                                          onClick={() => {
                                            if (isAllowStyle) return;
                                            showLogDetailsByRef(parsed.refNo, pr.record_id, parsed.module);
                                          }}
                                          title={isClientMaster ? 'Client master allow request' : (isChamberType ? 'Chamber type allow request' : (isChamberMaster ? (parsed.refNo === 'ADD' ? 'Chamber add allow request' : 'Chamber delete allow request') : (isMasterSetup ? 'Master Setup opens without allow' : 'Click to view data profile')))}
                                        >
                                          {isMasterSetup ? 'OPEN' : (isChamberMaster || isChamberType || isClientMaster ? (parsed.client || parsed.refNo) : (parsed.refNo || `#${pr.record_id}`))}
                                        </td>
                                        <td style={{ padding: '6px 8px', fontWeight: '700', color: '#0f172a' }}>{parsed.client}</td>
                                        <td style={{ padding: '6px 8px' }}>
                                          <span className="status-badge" style={{ 
                                            backgroundColor: isMasterSetup
                                              ? '#e0f2fe'
                                              : isClientMaster
                                                ? '#eff6ff'
                                              : isChamberType
                                                ? '#ffedd5'
                                              : (parsed.refNo === 'ADD'
                                                ? '#dbeafe'
                                                : (pr.raw_action === 'REQUEST_DELETE' || parsed.refNo === 'DELETE'
                                                  ? '#fee2e2'
                                                  : '#e0f2fe')),
                                            color: isMasterSetup
                                              ? '#0369a1'
                                              : isClientMaster
                                                ? '#1d4ed8'
                                              : isChamberType
                                                ? '#c2410c'
                                              : (parsed.refNo === 'ADD'
                                                ? '#1d4ed8'
                                                : (pr.raw_action === 'REQUEST_DELETE' || parsed.refNo === 'DELETE'
                                                  ? '#dc2626'
                                                  : '#0369a1')),
                                            fontWeight: 800 
                                          }}>
                                            {isMasterSetup ? 'OPEN' : (isChamberType ? 'TYPE' : (isChamberMaster ? (parsed.refNo || 'ALLOW') : (isClientMaster ? (parsed.refNo || 'NOTIFY') : (pr.raw_action === 'REQUEST_DELETE' ? 'DELETE' : 'EDIT'))))}
                                          </span>
                                        </td>
                                        <td style={{ padding: '6px 8px', color: '#334155' }}>
                                          <div style={{ fontWeight: '600', color: '#1e293b' }}>
                                            {(pr.description || '').split(' | ')[0]}
                                          </div>
                                          {(pr.remark || pr.request_remark) ? (
                                            <div style={{ fontSize: '0.66rem', color: '#0f766e', marginTop: '2px', fontWeight: 600 }}>
                                              Remark: {pr.remark || pr.request_remark}
                                            </div>
                                          ) : null}
                                          {parsed.extra !== '-' && (
                                            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px', fontStyle: 'italic' }}>
                                              {parsed.extra}
                                            </div>
                                          )}
                                        </td>
                                        <td style={{ padding: '6px 8px' }}>
                                          <span style={{
                                            display: 'inline-block',
                                            padding: '1px 6px',
                                            borderRadius: '100px',
                                            fontSize: '0.64rem',
                                            fontWeight: '800',
                                            color: '#ca8a04',
                                            backgroundColor: '#fef9c3',
                                          }}>
                                            {pr.status}
                                          </span>
                                        </td>
                                        <td style={{ padding: '6px 8px' }}>
                                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                          <button
                                            onClick={() => handleApproveDenyPermission(pr.id, 'Approved')}
                                            style={{
                                              padding: '4px 10px',
                                              borderRadius: 'var(--radius-sm)',
                                              border: 'none',
                                              backgroundColor: '#ea580c',
                                              color: '#ffffff',
                                              fontSize: '0.72rem',
                                              fontWeight: '800',
                                              cursor: 'pointer',
                                              boxShadow: '0 2px 5px rgba(234, 88, 12, 0.25)'
                                            }}
                                          >
                                            Approve
                                          </button>
                                          <button
                                            onClick={() => openDenyPermissionModal(pr)}
                                            style={{
                                              padding: '4px 10px',
                                              borderRadius: 'var(--radius-sm)',
                                              border: '1px solid var(--border)',
                                              backgroundColor: '#ffffff',
                                              color: 'var(--text-dark)',
                                              fontSize: '0.72rem',
                                              fontWeight: '700',
                                              cursor: 'pointer'
                                            }}
                                          >
                                            Deny
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Recent decisions — who (Sub Admin / Super Admin name + email) approved or denied */}
                    {(() => {
                      const decidedRows = filterDecidedPermissionRequests(
                        permissionRequests,
                        operatorWarehouseMap,
                        selectedWarehouseFilter,
                        40
                      );
                      return (
                        <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={18} color="#0369a1" />
                            <span>Permission audit — who approved / denied</span>
                          </h3>
                          <p style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                            Shows Sub Admin / Super Admin <strong>name</strong> and <strong>email</strong> for each decision.
                          </p>
                          {decidedRows.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              No approved or denied permission decisions yet for this filter.
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-main)' }}>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Status</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>DO (requester)</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Decided by (Name / Email)</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Module</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>Admin remark</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-dark)' }}>When</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {decidedRows.map((pr) => {
                                    if (!pr) return null;
                                    const isApproved = pr.status === 'Approved';
                                    return (
                                      <tr key={`decided-${pr.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px 8px' }}>
                                          <span style={{
                                            display: 'inline-block',
                                            padding: '1px 6px',
                                            borderRadius: '100px',
                                            fontSize: '0.64rem',
                                            fontWeight: '800',
                                            color: isApproved ? '#15803d' : '#b91c1c',
                                            backgroundColor: isApproved ? '#dcfce7' : '#fee2e2'
                                          }}>
                                            {pr.status}
                                          </span>
                                        </td>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0f172a' }}>
                                          {renderOperatorEmail(pr.operator_email)}
                                        </td>
                                        <td style={{ padding: '6px 8px' }}>{renderDecidedByCell(pr)}</td>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#475569' }}>
                                          {pr.record_type || '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px', color: '#0f766e', fontWeight: 600, maxWidth: 220 }}>
                                          {pr.admin_remark || pr.remark || '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                          {pr.created_at
                                            ? new Date(pr.created_at).toLocaleString('en-GB', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true
                                              })
                                            : '—'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Security logs removed from Tab 2 */}
                  </div>
                );
              })()
            )}
              </section>
            </div>
          </div>
        )}

        {/* --- Menu: Master data (warehouses + clients catalog) --- */}
        {activeMenu === 'master_data' && (
          <MasterDataPanel onBack={() => setActiveMenu('dashboard')} />
        )}

        {/* --- Menu: Customers (web/mobile customer accounts, access scope) --- */}
        {activeMenu === 'customers' && (
          <div className="sa-um">
            <div className="sa-op-gmail sa-reg-op" data-ui="register-customer-v2">
              <div className="sa-reg-page-head">
                <button
                  type="button"
                  className="sa-reg-back"
                  onClick={() => {
                    if (editingSubAdmin) cancelEditSubAdmin();
                    else setActiveMenu('dashboard');
                  }}
                  title={editingSubAdmin ? 'Cancel edit' : 'Back to dashboard'}
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h2 className="sa-op-title">
                    {editingSubAdmin ? 'Modify Customer Profile' : 'Register New Customer'}
                  </h2>
                  <p className="sa-op-sub">
                    {editingSubAdmin
                      ? `Update ${editingSubAdmin.email || 'customer'} — warehouse and client access apply to their portal.`
                      : 'Add a new customer to the ReeferON system. Registered credentials grant dashboard and inquiry access.'}
                  </p>
                </div>
              </div>

              <section className="sa-op-card sa-reg-details-card">
                <div className="sa-op-card-head">
                  <div className="sa-op-card-icon">
                    <User size={16} />
                  </div>
                  <h2 className="sa-op-title">Customer Details</h2>
                </div>

                <form onSubmit={handleSaveSubAdmin} className="sa-op-form">
                  <div className="sa-op-form-grid cols-3">
                    <label className="sa-op-field">
                      <span>Full Name</span>
                      <div className="sa-reg-input">
                        <User size={15} />
                        <input
                          type="text"
                          name="subadmin-full-name"
                          inputMode="text"
                          autoComplete="name"
                          placeholder="e.g. Jane Doe"
                          value={subAdminFullName}
                          onChange={(e) => setSubAdminFullName(e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''))}
                          required
                        />
                      </div>
                    </label>

                    <label className="sa-op-field">
                      <span>Phone No.</span>
                      <div className="sa-reg-input sa-reg-input-phone">
                        <div className="sa-op-phone">
                          <span className="sa-op-phone-code">+91</span>
                          <input
                            type="tel"
                            name="subadmin-phone"
                            inputMode="numeric"
                            autoComplete="tel"
                            placeholder="9876543210"
                            maxLength={10}
                            value={subAdminPhoneNo}
                            onChange={(e) => setSubAdminPhoneNo(toLocalTenDigitPhone(e.target.value))}
                            pattern="[0-9]{10}"
                            title="Enter a 10-digit mobile number"
                            required
                          />
                        </div>
                      </div>
                    </label>

                    <label className="sa-op-field">
                      <span>Email ID</span>
                      <div className="sa-reg-input">
                        <Mail size={15} />
                        <input
                          type="email"
                          name="subadmin-email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="e.g. customer@client.com"
                          value={subAdminEmail}
                          onChange={(e) => setSubAdminEmail(e.target.value)}
                          required
                        />
                      </div>
                    </label>

                    <label className="sa-op-field">
                      <span>{editingSubAdmin ? 'Password (leave blank to keep)' : 'Password'}</span>
                      <div className="sa-reg-input">
                        <Lock size={15} />
                        <div className="sa-op-password">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="subadmin-password"
                            autoComplete="new-password"
                            placeholder={editingSubAdmin ? '••••••••' : 'Enter login password'}
                            value={subAdminPassword}
                            onChange={(e) => setSubAdminPassword(e.target.value)}
                            required={!editingSubAdmin}
                          />
                          <button
                            type="button"
                            className="sa-op-password-toggle"
                            onClick={() => setShowPassword((prev) => !prev)}
                            title={showPassword ? 'Hide Password' : 'Show Password'}
                          >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    </label>

                    <label className="sa-op-field">
                      <span>Registration Date</span>
                      <div className="sa-reg-input">
                        <Calendar size={15} />
                        <input
                          type="text"
                          className="sa-reg-readonly"
                          readOnly
                          value={
                            editingSubAdmin?.created_at
                              ? new Date(editingSubAdmin.created_at).toLocaleDateString('en-GB')
                              : new Date().toLocaleDateString('en-GB')
                          }
                          aria-label="Registration date"
                        />
                      </div>
                    </label>

                    <label className="sa-op-field sa-reg-scope-field">
                      <span>Allowed Warehouses</span>
                      <div className="sa-reg-input">
                        <Home size={15} />
                        <select
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val && !subAdminSelectedWarehouses.includes(val)) {
                              setSubAdminSelectedWarehouses((prev) => [...prev, val]);
                            }
                          }}
                        >
                          <option value="">
                            {warehouseSelectOptions.length === 0
                              ? 'No warehouses yet — add them in Master Data'
                              : 'Select warehouse…'}
                          </option>
                          {warehouseSelectOptions
                            .filter((w) => !subAdminSelectedWarehouses.includes(w.value))
                            .map((wh) => (
                              <option key={wh.value} value={wh.value}>
                                {wh.label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="sa-op-chips">
                        {subAdminSelectedWarehouses.length === 0 ? (
                          <em>No warehouses selected — full warehouse access</em>
                        ) : (
                          subAdminSelectedWarehouses.map((wh, idx) => (
                            <span key={idx} className="sa-op-chip">
                              {lookupMasterLabel(wh, accessScopeOptions.warehouseMasters)}
                              <button
                                type="button"
                                onClick={() =>
                                  setSubAdminSelectedWarehouses((prev) => prev.filter((_, i) => i !== idx))
                                }
                                title="Remove"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </label>

                    <label className="sa-op-field sa-reg-scope-field">
                      <span>Allowed Clients</span>
                      <div className="sa-reg-input">
                        <Package size={15} />
                        <select
                          value=""
                          disabled={subAdminSelectedWarehouses.length === 0}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            if (val === '__ALL__') {
                              setSubAdminSelectedClients([]);
                              return;
                            }
                            if (!subAdminSelectedClients.includes(val)) {
                              setSubAdminSelectedClients((prev) => [...prev, val]);
                            }
                          }}
                        >
                          <option value="">
                            {subAdminSelectedWarehouses.length === 0
                              ? 'Select warehouse(s) first to see clients…'
                              : subAdminClientOptions.length === 0
                                ? 'No clients found for selected warehouse(s)'
                                : `Select client (${subAdminClientOptions.length} for selected warehouse(s))…`}
                          </option>
                          {subAdminSelectedWarehouses.length > 0 ? (
                            <option value="__ALL__">All — all products in selected warehouse(s)</option>
                          ) : null}
                          {subAdminClientOptions
                            .filter((c) => !subAdminSelectedClients.includes(c.value))
                            .map((client) => (
                              <option key={client.value} value={client.value}>
                                {client.label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="sa-op-chips">
                        {subAdminSelectedWarehouses.length === 0 ? (
                          <em>Pick warehouses above — clients will list for those warehouses only</em>
                        ) : subAdminSelectedClients.length === 0 ? (
                          <span className="sa-op-chip" title="Full access to all products in selected warehouse(s)">
                            All products
                          </span>
                        ) : (
                          subAdminSelectedClients.map((client, idx) => (
                            <span key={idx} className="sa-op-chip">
                              {lookupMasterLabel(client, accessScopeOptions.clientMasters)}
                              <button
                                type="button"
                                onClick={() =>
                                  setSubAdminSelectedClients((prev) => prev.filter((_, i) => i !== idx))
                                }
                                title="Remove"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </label>

                    <label className="sa-op-field sa-reg-notes-field">
                      <span>Notes / Remarks</span>
                      <div className="sa-reg-textarea-wrap">
                        <FileText size={15} />
                        <textarea
                          name="subadmin-notes"
                          rows={3}
                          placeholder="Optional notes or special instructions..."
                          value={subAdminNotes}
                          onChange={(e) => setSubAdminNotes(e.target.value)}
                        />
                      </div>
                    </label>
                  </div>

                  <div className="sa-op-form-actions">
                    <button type="button" className="sa-reg-btn-reset" onClick={resetSubAdminForm}>
                      <RefreshCw size={14} />
                      Reset
                    </button>
                    {editingSubAdmin ? (
                      <button type="button" className="sa-op-btn-text" onClick={cancelEditSubAdmin}>
                        Cancel
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      className={`sa-op-btn-primary${editingSubAdmin ? ' update' : ''}`}
                      disabled={savingSubAdmin || loadingSubAdmins}
                    >
                      {savingSubAdmin ? (
                        <>
                          <Loader2 size={14} className="spinner-icon" />
                          {subAdminProcessStatus || 'Processing…'}
                        </>
                      ) : (
                        <>
                          <UserPlus size={14} />
                          {editingSubAdmin ? 'Update Customer' : 'Register Customer'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>

              <section className="sa-op-card sa-op-directory sa-reg-dir-card">
                {(() => {
                  const avatarPalette = [
                    { bg: '#dbeafe', color: '#1d4ed8' },
                    { bg: '#ede9fe', color: '#6d28d9' },
                    { bg: '#ccfbf1', color: '#0f766e' },
                    { bg: '#ffedd5', color: '#c2410c' },
                    { bg: '#fce7f3', color: '#be185d' },
                    { bg: '#e0e7ff', color: '#3730a3' }
                  ];
                  const relativeAgo = (iso) => {
                    if (!iso) return '';
                    const t = new Date(iso).getTime();
                    if (Number.isNaN(t)) return '';
                    const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
                    if (days === 0) return 'today';
                    if (days === 1) return '1 day ago';
                    if (days < 60) return `${days} days ago`;
                    const months = Math.round(days / 30);
                    return months === 1 ? '1 month ago' : `${months} months ago`;
                  };
                  const filteredSubAdminsList = subAdmins.filter((sa) => {
                    const term = subAdminSearch.toLowerCase();
                    return (
                      (sa.full_name && sa.full_name.toLowerCase().includes(term)) ||
                      (sa.email && sa.email.toLowerCase().includes(term)) ||
                      (sa.phone_no && String(sa.phone_no).toLowerCase().includes(term)) ||
                      (sa.allowed_warehouses && String(sa.allowed_warehouses).toLowerCase().includes(term))
                    );
                  });
                  return (
                    <>
                      <div className="sa-reg-dir-head">
                        <div className="sa-reg-dir-title">
                          <div className="sa-op-card-icon">
                            <User size={16} />
                          </div>
                          <div>
                            <h2 className="sa-op-title">Customers Directory</h2>
                            <p className="sa-op-sub">
                              {filteredSubAdminsList.length} customer
                              {filteredSubAdminsList.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="sa-op-dir-tools">
                          <label className="sa-op-search sa-reg-search">
                            <Search size={15} />
                            <input
                              type="search"
                              placeholder="Search by name, email, warehouse..."
                              value={subAdminSearch}
                              onChange={(e) => setSubAdminSearch(e.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            className="sa-op-btn-export"
                            onClick={handleExportCustomersDirectory}
                            disabled={!subAdmins || subAdmins.length === 0}
                            title="Export customers directory to CSV"
                          >
                            <Download size={14} />
                            <span>Export</span>
                          </button>
                        </div>
                      </div>

                      {exportError?.retryKey === 'customers' && (
                        <div className="sa-op-banner-wrap">
                          <ExportErrorBanner
                            message={exportError.message}
                            retryable={exportError.retryable}
                            onRetry={retryFailedExport}
                            onDismiss={() => setExportError(null)}
                          />
                        </div>
                      )}
                      {subAdminSuccess && <div className="sa-op-banner success">{subAdminSuccess}</div>}
                      {subAdminError && (
                        <div className="sa-op-banner-wrap">
                          <LoadErrorBanner
                            message={subAdminError}
                            onRetry={loadSubAdminsData}
                            onDismiss={() => setSubAdminError('')}
                          />
                        </div>
                      )}

                      {loadingSubAdmins ? (
                        <SaDataLoading label="Loading customers…" />
                      ) : filteredSubAdminsList.length === 0 ? (
                        <div className="sa-op-empty">
                          <ShieldAlert size={28} />
                          <p>No matching customers found.</p>
                        </div>
                      ) : (
                        <div className="sa-op-inbox">
                          <table className="sa-op-dir-table sa-reg-dir-table sa-reg-dir-table-customers">
                            <thead>
                              <tr>
                                <th>Customer</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Warehouses</th>
                                <th>Clients</th>
                                <th>Registered</th>
                                <th>Status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSubAdminsList.map((sa, idx) => {
                                const initials =
                                  String(sa.full_name || sa.email || 'CU')
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((p) => p[0]?.toUpperCase())
                                    .join('') || 'CU';
                                const tone = avatarPalette[(Number(sa.id) || idx) % avatarPalette.length];
                                const warehouseList = sa.allowed_warehouses
                                  ? sa.allowed_warehouses.split(',').map((w) => w.trim()).filter(Boolean)
                                  : [];
                                const clientList = sa.allowed_clients
                                  ? sa.allowed_clients.split(',').map((c) => c.trim()).filter(Boolean)
                                  : [];
                                const warehouseLabel = warehouseList.length
                                  ? warehouseList
                                      .map((w) => lookupMasterLabel(w, accessScopeOptions.warehouseMasters) || w)
                                      .join(', ')
                                  : 'All warehouses';
                                const clientLabel = clientList.length
                                  ? clientList
                                      .map((c) => lookupMasterLabel(c, accessScopeOptions.clientMasters) || c)
                                      .join(', ')
                                  : 'All products';
                                const regDate = sa.created_at
                                  ? new Date(sa.created_at).toLocaleDateString('en-GB')
                                  : '—';
                                const ago = relativeAgo(sa.created_at);
                                return (
                                  <tr key={sa.id} className="sa-op-dir-row">
                                    <td className="sa-op-dir-td-operator">
                                      <button
                                        type="button"
                                        className="sa-op-dir-operator-btn"
                                        onClick={() => startEditSubAdmin(sa)}
                                        title="Edit Customer Profile"
                                      >
                                        <span
                                          className="sa-op-avatar sa-reg-avatar"
                                          style={{ background: tone.bg, color: tone.color }}
                                        >
                                          {initials}
                                        </span>
                                        <span className="sa-op-sender">
                                          <strong>{sa.full_name || 'Unnamed customer'}</strong>
                                          <em>#{sa.id}</em>
                                        </span>
                                      </button>
                                    </td>
                                    <td className="sa-op-dir-td-email" title={sa.email || ''}>
                                      {sa.email || '—'}
                                    </td>
                                    <td className="sa-op-dir-td-phone">
                                      {sa.phone_no ? formatIndiaPhoneDisplay(sa.phone_no) : '—'}
                                    </td>
                                    <td className="sa-op-dir-td-wh" title={warehouseLabel}>
                                      <span className="sa-reg-wh-cell">
                                        <Home size={13} />
                                        {warehouseLabel}
                                      </span>
                                    </td>
                                    <td className="sa-op-dir-td-clients" title={clientLabel}>
                                      {clientLabel}
                                    </td>
                                    <td className="sa-op-dir-td-date">
                                      <span className="sa-reg-date-cell">
                                        {regDate}
                                        {ago ? <span className="sa-reg-ago">, {ago}</span> : null}
                                      </span>
                                    </td>
                                    <td className="sa-op-dir-td-status">
                                      <span className="sa-reg-status">
                                        <span className="sa-reg-status-dot" />
                                        Active
                                      </span>
                                    </td>
                                    <td className="sa-op-dir-td-actions">
                                      <div className="sa-op-row-actions sa-reg-row-actions">
                                        <button
                                          type="button"
                                          className="sa-op-icon-btn"
                                          onClick={() => startEditSubAdmin(sa)}
                                          title="Edit"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <div className="sa-reg-more-wrap">
                                          <button
                                            type="button"
                                            className="sa-op-icon-btn"
                                            title="More"
                                            onClick={() =>
                                              setCustDirMenuId((cur) => (cur === sa.id ? null : sa.id))
                                            }
                                          >
                                            <MoreVertical size={14} />
                                          </button>
                                          {custDirMenuId === sa.id ? (
                                            <div className="sa-reg-more-menu">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setCustDirMenuId(null);
                                                  handleDeleteSubAdmin(sa);
                                                }}
                                              >
                                                <Trash2 size={13} />
                                                Revoke access
                                              </button>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  );
                })()}
              </section>
            </div>
          </div>
        )}

        {/* --- Menu: Data operators (CRUD, chamber mappings, task status, SA edit monitors) --- */}
        {activeMenu === 'data_operators' && (
          <div className="sa-um">
            {viewingOperator ? (
              (() => {
                const op = viewingOperator;
                const profileMasterActivities = activitiesForOperatorEmail(opMasterActivities, op.email);
                const initials = String(op.full_name || op.email || 'DO')
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join('') || 'DO';
                const profileFields = [
                  { label: 'Operator ID', value: `#${op.id}` },
                  { label: 'Full Name', value: op.full_name || '—' },
                  { label: 'Phone No.', value: formatIndiaPhoneDisplay(op.phone_no) },
                  { label: 'Email Address', value: op.email || '—' },
                  { label: 'Warehouse / Data Access', value: op.warehouse_name || 'Not Configured' },
                  { label: 'Chamber Limit', value: String(op.chamber_limit || 4) },
                  { label: 'Registration Date', value: op.created_at ? new Date(op.created_at).toLocaleDateString('en-GB') : '—' }
                ];
                const inTotal = Number(op.total_inward) || 0;
                const outTotal = Number(op.total_outward) || 0;
                const inToday = Number(op.today_inward) || 0;
                const outToday = Number(op.today_outward) || 0;
                const ioLoading = Boolean(op.io_counts_loading);
                const opActiveAssignments = getActiveOperatorAssignments(opMappings, op.chamber_limit || 4);
                const opDisplayChambers = getOperatorDisplayChambers(
                  opChambersList,
                  opMappings,
                  op.chamber_limit || 4,
                  op.warehouse_name
                );
                const opTaskStatus = computeDoTaskStatus({
                  assignments: opActiveAssignments,
                  logs: opTaskLogs,
                  fromDate: opTaskAppliedFrom,
                  toDate: opTaskAppliedTo,
                  today: localDateStr()
                });
                const opTaskChamberOptions = Array.from(
                  new Set(
                    (opTaskStatus.items || [])
                      .map((item) => String(item.chamber_name || '').trim())
                      .filter(Boolean)
                  )
                ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                const filteredOpTasks = opTaskStatus.items.filter((item) => {
                  if (opTaskFilter !== 'all' && item.status !== opTaskFilter) return false;
                  if (
                    opTaskChamberFilter !== 'all' &&
                    String(item.chamber_name || '').trim() !== opTaskChamberFilter
                  ) {
                    return false;
                  }
                  return true;
                });
                const mappingActiveClients = uniqueClientsByName(
                  (opMappings || []).filter((m) => !isDeactiveAssignment(m))
                );
                const mappingActiveNames = new Set(
                  mappingActiveClients.map((m) => String(m.client_name || '').trim().toLowerCase())
                );
                const mappingInactiveClients = uniqueClientsByName(
                  (opMappings || []).filter(
                    (m) =>
                      isDeactiveAssignment(m) &&
                      !mappingActiveNames.has(String(m.client_name || '').trim().toLowerCase())
                  )
                );
                const mappingTotalClients = mappingActiveClients.length + mappingInactiveClients.length;
                const chamberLimit = Number(op.chamber_limit) || 4;
                const periodLabel =
                  opTaskAppliedFrom && opTaskAppliedTo
                    ? opTaskAppliedFrom === opTaskAppliedTo
                      ? formatDateStr(opTaskAppliedFrom)
                      : `${formatDateStr(opTaskAppliedFrom)} → ${formatDateStr(opTaskAppliedTo)}`
                    : 'Selected period';
                const todayKey = localDateStr();
                const todayItems = (opTaskStatus.items || []).filter((i) => i.date === todayKey);
                const todayMorn = todayItems.filter((i) => String(i.shift || '').toLowerCase().includes('morn'));
                const todayEve = todayItems.filter((i) => String(i.shift || '').toLowerCase().includes('eve'));
                const todayMornDone = todayMorn.filter((i) => i.status === 'completed').length;
                const todayMornTotal = todayMorn.length;
                const todayEveDone = todayEve.filter((i) => i.status === 'completed').length;
                const todayEveTotal = todayEve.length;
                const todayMornPct =
                  todayMornTotal > 0 ? Math.min(100, Math.round((todayMornDone / todayMornTotal) * 100)) : 0;
                const todayEvePct =
                  todayEveTotal > 0 ? Math.min(100, Math.round((todayEveDone / todayEveTotal) * 100)) : 0;
                const periodDates =
                  opTaskAppliedFrom && opTaskAppliedTo
                    ? enumerateDateKeys(opTaskAppliedFrom, opTaskAppliedTo)
                    : [];
                const ioMoveTotal = (Number(inTotal) || 0) + (Number(outTotal) || 0);
                const inSharePct =
                  ioMoveTotal > 0 ? Math.min(100, Math.round(((Number(inTotal) || 0) / ioMoveTotal) * 100)) : 0;
                const outSharePct = ioMoveTotal > 0 ? Math.max(0, 100 - inSharePct) : 0;
                const taskTotal = Number(opTaskStatus.total) || 0;
                const taskCompleted = Number(opTaskStatus.completed) || 0;
                const taskPending = Number(opTaskStatus.pending) || 0;
                const taskOverdue = Number(opTaskStatus.overdue) || 0;
                const ioForDate = (dateKey) => {
                  const day = opIoByDate?.[dateKey];
                  if (day) {
                    return {
                      in: Number(day.inward) || 0,
                      out: Number(day.outward) || 0
                    };
                  }
                  if (dateKey === todayKey) {
                    return { in: inToday, out: outToday };
                  }
                  return { in: 0, out: 0 };
                };
                const shiftCellTone = (row, kind) => {
                  const total = kind === 'morning' ? row.morning : row.evening;
                  const done = kind === 'morning' ? row.mornDone : row.eveDone;
                  const overdue = kind === 'morning' ? row.mornOverdue : row.eveOverdue;
                  if (total === 0) return { label: '—', tone: 'idle', done: 0, expected: 0 };
                  const label = `${done}/${total}`;
                  if (done === total) return { label, tone: 'ok', done, expected: total };
                  if (overdue > 0) return { label, tone: 'bad', done, expected: total };
                  return { label, tone: 'warn', done, expected: total };
                };
                // Group task items by date for timeline table
                const timelineByDate = {};
                (filteredOpTasks || []).forEach((task) => {
                  const d = task.date || '—';
                  if (!timelineByDate[d]) {
                    timelineByDate[d] = {
                      date: d,
                      morning: 0,
                      evening: 0,
                      mornDone: 0,
                      eveDone: 0,
                      mornOverdue: 0,
                      eveOverdue: 0,
                      overdue: 0,
                      pending: 0
                    };
                  }
                  const shift = String(task.shift || '').toLowerCase();
                  const done = task.status === 'completed';
                  if (shift.includes('morn')) {
                    timelineByDate[d].morning += 1;
                    if (done) timelineByDate[d].mornDone += 1;
                    else if (task.status === 'overdue') timelineByDate[d].mornOverdue += 1;
                  } else if (shift.includes('eve')) {
                    timelineByDate[d].evening += 1;
                    if (done) timelineByDate[d].eveDone += 1;
                    else if (task.status === 'overdue') timelineByDate[d].eveOverdue += 1;
                  }
                  if (task.status === 'overdue') timelineByDate[d].overdue += 1;
                  if (task.status === 'pending') timelineByDate[d].pending += 1;
                });
                const timelineRows = Object.values(timelineByDate)
                  .sort((a, b) => String(b.date).localeCompare(String(a.date)));
                const TIMELINE_PAGE_SIZE = 10;
                const timelineTotal = timelineRows.length;
                const timelinePageSafe = Math.min(
                  Math.max(1, opTimelinePage),
                  Math.max(1, Math.ceil(timelineTotal / TIMELINE_PAGE_SIZE) || 1)
                );
                const pagedTimelineRows = timelineRows.slice(
                  (timelinePageSafe - 1) * TIMELINE_PAGE_SIZE,
                  timelinePageSafe * TIMELINE_PAGE_SIZE
                );
                const timelineRowStatus = (row) => {
                  const st =
                    row.overdue > 0
                      ? 'bad'
                      : row.pending > 0
                        ? 'warn'
                        : row.morning + row.evening > 0 &&
                            row.mornDone + row.eveDone === row.morning + row.evening
                          ? 'ok'
                          : 'idle';
                  const label =
                    st === 'bad'
                      ? 'Overdue'
                      : st === 'warn'
                        ? 'Partial'
                        : st === 'ok'
                          ? 'Completed'
                          : 'Pending';
                  return { st, label };
                };
                const exportTimelineExcelSheet = () => {
                  try {
                    if (!confirmExportSize(timelineRows.length)) return;
                    const headers = [
                      'Date',
                      'Morning (done/expected)',
                      'Evening (done/expected)',
                      'Total Task',
                      'Inward',
                      'Outward',
                      'Status'
                    ];
                    const rows = timelineRows.map((row) => {
                      const mornCell = shiftCellTone(row, 'morning');
                      const eveCell = shiftCellTone(row, 'evening');
                      const { label } = timelineRowStatus(row);
                      const dayIo = ioForDate(row.date);
                      return [
                        formatDateStr(row.date),
                        excelRatioText(mornCell.done, mornCell.expected),
                        excelRatioText(eveCell.done, eveCell.expected),
                        row.morning + row.evening,
                        dayIo.in,
                        dayIo.out,
                        label
                      ];
                    });
                    const csv = toCsvContent(headers, rows);
                    const doCode = `DO-${String(op.id || '').padStart(3, '0')}`;
                    const fromPart = opTaskAppliedFrom || 'all';
                    const toPart = opTaskAppliedTo || 'all';
                    downloadCsv(
                      `${doCode}_Task_Timeline_${fromPart}_to_${toPart}.csv`,
                      csv
                    );
                  } catch (err) {
                    window.alert(getExportErrorMessage(err));
                  }
                };
                return (
                  <div className="do-prof">
                    <div className="do-prof-topbar">
                      <label className="do-prof-search">
                        <Search size={15} />
                        <input
                          type="search"
                          placeholder="Search DO, operator, warehouse..."
                          value={operatorSearch}
                          onChange={(e) => setOperatorSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') closeOperatorProfile();
                          }}
                          aria-label="Search operators"
                        />
                      </label>
                      <span className="do-prof-live">
                        <span className="do-prof-live-dot" />
                        Live System Monitoring
                      </span>
                    </div>

                    <div className="do-prof-page-head">
                      <div className="do-prof-page-head-left">
                        <button type="button" className="do-prof-back" onClick={closeOperatorProfile} title="Back">
                          <ArrowLeft size={18} />
                        </button>
                        <h1>DO Profile</h1>
                      </div>
                      <div className="do-prof-page-actions">
                        <button type="button" className="do-prof-btn" onClick={() => startEditOperator(op)}>
                          <Edit size={14} />
                          Edit
                        </button>
                        <button type="button" className="do-prof-btn danger" onClick={() => handleDeleteOperator(op)}>
                          <Trash2 size={14} />
                          Revoke
                        </button>
                      </div>
                    </div>

                    <section className="do-prof-hero do-prof-hero-v3">
                      <div className="do-prof-hero-info">
                        <div className="do-prof-hero-id">
                          <span className="do-prof-avatar">{initials}</span>
                          <div className="do-prof-hero-id-body">
                            <div className="do-prof-name-row">
                              <h2>{op.full_name || 'Data Operator'}</h2>
                              <span className="do-prof-active">
                                <i />
                                Active
                              </span>
                            </div>
                            <p className="do-prof-role">
                              <span>Data Operator (DO)</span>
                              <span className="do-prof-id-chip">
                                DO-{String(op.id || '').padStart(3, '0')}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="do-prof-info-meta">
                          <span className="do-prof-meta-chip">
                            <Phone size={12} />
                            <b>Phone</b>
                            <em>{formatIndiaPhoneDisplay(op.phone_no) || '—'}</em>
                          </span>
                          <span className="do-prof-meta-chip">
                            <Mail size={12} />
                            <b>Email</b>
                            <em title={op.email || ''}>{op.email || '—'}</em>
                          </span>
                          <span className="do-prof-meta-chip">
                            <Home size={12} />
                            <b>Warehouse</b>
                            <em>{op.warehouse_name || 'Not configured'}</em>
                          </span>
                          <span className="do-prof-meta-chip">
                            <LayoutGrid size={12} />
                            <b>Chamber Limit</b>
                            <em>{chamberLimit}</em>
                          </span>
                          <span className="do-prof-meta-chip wide">
                            <Calendar size={12} />
                            <b>Registered</b>
                            <em>
                              {op.created_at
                                ? new Date(op.created_at).toLocaleDateString('en-GB')
                                : '—'}
                            </em>
                          </span>
                        </div>
                      </div>

                      <div className="do-prof-hero-today">
                        <h3>
                          TODAY STATUS
                          <span>{formatDateStr(todayKey)}</span>
                        </h3>
                        <article className="do-prof-today-item ring">
                          <div
                            className="do-prof-donut morn"
                            style={{ '--pct': `${todayMornPct}%` }}
                          >
                            <i>{todayMornPct}%</i>
                          </div>
                          <span>
                            <Sun size={12} /> Morning
                          </span>
                          <strong>
                            {todayMornDone}/{todayMornTotal || 0}
                          </strong>
                        </article>
                        <article className="do-prof-today-item ring">
                          <div
                            className="do-prof-donut eve"
                            style={{ '--pct': `${todayEvePct}%` }}
                          >
                            <i>{todayEvePct}%</i>
                          </div>
                          <span>
                            <Moon size={12} /> Evening
                          </span>
                          <strong>
                            {todayEveDone}/{todayEveTotal || 0}
                          </strong>
                        </article>
                        <article className="do-prof-today-item in">
                          <span>
                            <ArrowDownLeft size={13} /> Today Inward
                          </span>
                          <strong>{ioLoading ? '…' : inToday}</strong>
                          <em>of {ioLoading ? '…' : inTotal} total</em>
                        </article>
                        <article className="do-prof-today-item out">
                          <span>
                            <ArrowUpRight size={13} /> Today Outward
                          </span>
                          <strong>{ioLoading ? '…' : outToday}</strong>
                          <em>of {ioLoading ? '…' : outTotal} total</em>
                        </article>
                      </div>
                    </section>

                    <div className="do-prof-tabs">
                      {[
                        { id: 'overview', label: 'Overview' },
                        { id: 'task_status', label: 'Task History' },
                        { id: 'mappings', label: 'Client Mapping' },
                        { id: 'master_activity', label: 'Activity Log' }
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`do-prof-tab${opProfileSection === t.id ? ' active' : ''}`}
                          onClick={() => setOpProfileSection(t.id)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {opProfileSection === 'overview' && (
                      <div className="do-prof-dash">
                        <section className="do-prof-section do-prof-analytics">
                          <div className="do-prof-section-head">
                            <h3>Selected Period Analytics</h3>
                            <div className="do-prof-daterange">
                              <Calendar size={14} />
                              <input
                                type="date"
                                value={opTaskFromDate}
                                max={opTaskToDate || localDateStr()}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setOpTaskFromDate(val);
                                  if (val && opTaskToDate && val > opTaskToDate) setOpTaskToDate(val);
                                }}
                              />
                              <span>→</span>
                              <input
                                type="date"
                                value={opTaskToDate}
                                min={opTaskFromDate || undefined}
                                max={localDateStr()}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setOpTaskToDate(val);
                                  if (val && opTaskFromDate && val < opTaskFromDate) setOpTaskFromDate(val);
                                }}
                              />
                              <button
                                type="button"
                                className="do-prof-btn primary"
                                style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                                onClick={() => applyOpTaskDateRange(op, opTaskFromDate, opTaskToDate)}
                                disabled={opTaskLogsLoading || !opTaskFromDate || !opTaskToDate}
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                          <div className="do-prof-analytics-stack">
                              <div className="do-prof-analytics-mid">
                                <div className="do-prof-left-stack">
                                  <div className="do-prof-usage-row cols-2">
                                    <div className="do-prof-card do-prof-usage-card">
                                      <div className="do-prof-chart-head">
                                        <h4>Inward / Outward Usage</h4>
                                      </div>
                                      <p className="do-prof-range-label">
                                        <strong>{periodLabel}</strong>
                                      </p>
                                      <div className="do-prof-io-donut-wrap">
                                        <div
                                          className={`do-prof-donut io-mix${ioMoveTotal === 0 ? ' empty' : ''}`}
                                          style={{ '--pct': `${inSharePct}%` }}
                                          title={`Total Inward ${inTotal} · Total Outward ${outTotal}`}
                                        >
                                          <i>
                                            {ioLoading ? '…' : ioMoveTotal}
                                            <b>total</b>
                                          </i>
                                        </div>
                                        <div className="do-prof-io-donut-stats">
                                          <div className="do-prof-io-stat in">
                                            <span>
                                              <ArrowDownLeft size={14} /> Total Inward
                                            </span>
                                            <strong>{ioLoading ? '…' : inTotal}</strong>
                                            <em>{inSharePct}%</em>
                                          </div>
                                          <div className="do-prof-io-stat out">
                                            <span>
                                              <ArrowUpRight size={14} /> Total Outward
                                            </span>
                                            <strong>{ioLoading ? '…' : outTotal}</strong>
                                            <em>{outSharePct}%</em>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="do-prof-card do-prof-task-graph-card">
                                      <div className="do-prof-chart-head">
                                        <h4>Task Status (Calendar)</h4>
                                      </div>
                                      <p className="do-prof-range-label">
                                        Calendar:{' '}
                                        <strong>{periodLabel}</strong>
                                        {periodDates.length > 0
                                          ? ` · ${periodDates.length} day${periodDates.length === 1 ? '' : 's'}`
                                          : ''}
                                      </p>
                                      <div className="do-prof-task-count-grid">
                                        <div className="do-prof-task-count all">
                                          <span>Total</span>
                                          <strong>{taskTotal}</strong>
                                        </div>
                                        <div className="do-prof-task-count ok">
                                          <span>Completed</span>
                                          <strong>{taskCompleted}</strong>
                                        </div>
                                        <div className="do-prof-task-count warn">
                                          <span>Pending</span>
                                          <strong>{taskPending}</strong>
                                        </div>
                                        <div className="do-prof-task-count bad">
                                          <span>Overdue</span>
                                          <strong>{taskOverdue}</strong>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="do-prof-card do-prof-timeline-card">
                                    <div className="do-prof-card-head">
                                      <h3>DO Task Timeline</h3>
                                      <button
                                        type="button"
                                        className="do-prof-btn primary"
                                        style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                                        onClick={exportTimelineExcelSheet}
                                        disabled={timelineRows.length === 0 || opTaskLogsLoading}
                                        title="Download DO Task Timeline as Excel sheet (.csv)"
                                      >
                                        <Download size={13} />
                                        Export Excel Sheet
                                      </button>
                                    </div>
                                    {timelineRows.length === 0 ? (
                                      <div className="do-prof-empty">
                                        {opTaskLogsLoading ? 'Loading tasks…' : 'No tasks in this range.'}
                                      </div>
                                    ) : (
                                      <>
                                        <div className="do-prof-table-wrap">
                                          <table className="do-prof-table">
                                            <thead>
                                              <tr>
                                                <th>Date</th>
                                                <th>
                                                  Morning
                                                  <span className="do-prof-th-sub">done/expected</span>
                                                </th>
                                                <th>
                                                  Evening
                                                  <span className="do-prof-th-sub">done/expected</span>
                                                </th>
                                                <th>Total Task</th>
                                                <th>Inward</th>
                                                <th>Outward</th>
                                                <th>Status</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {pagedTimelineRows.map((row) => {
                                                const mornCell = shiftCellTone(row, 'morning');
                                                const eveCell = shiftCellTone(row, 'evening');
                                                const { st, label } = timelineRowStatus(row);
                                                const rowTotal = row.morning + row.evening;
                                                const dayIo = ioForDate(row.date);
                                                return (
                                                  <tr key={row.date}>
                                                    <td>{formatDateStr(row.date)}</td>
                                                    <td>
                                                      <span className={`do-prof-pill ${mornCell.tone}`}>
                                                        {mornCell.label}
                                                      </span>
                                                    </td>
                                                    <td>
                                                      <span className={`do-prof-pill ${eveCell.tone}`}>
                                                        {eveCell.label}
                                                      </span>
                                                    </td>
                                                    <td>
                                                      <strong>{rowTotal}</strong>
                                                    </td>
                                                    <td>{dayIo.in}</td>
                                                    <td>{dayIo.out}</td>
                                                    <td>
                                                      <span className={`do-prof-pill ${st}`}>{label}</span>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                        <PaginationBar
                                          page={timelinePageSafe}
                                          totalItems={timelineTotal}
                                          pageSize={TIMELINE_PAGE_SIZE}
                                          onPageChange={setOpTimelinePage}
                                          itemLabel="days"
                                        />
                                      </>
                                    )}
                                  </div>
                                </div>

                                <div className="do-prof-col-stack">
                                  <div className="do-prof-card">
                                    <h3>Warehouse &amp; Chamber Access</h3>
                                    <div className="do-prof-wh-line">
                                      <span>Assigned Warehouse</span>
                                      <strong>{op.warehouse_name || 'Not configured'}</strong>
                                    </div>
                                    <div className="do-prof-wh-line">
                                      <span>Chamber Limit</span>
                                      <strong>{chamberLimit}</strong>
                                    </div>
                                    <div className="do-prof-chambers">
                                      {(opDisplayChambers.length
                                        ? opDisplayChambers
                                        : Array.from({ length: chamberLimit }, (_, i) => ({
                                            chamber_name: `Chamber ${i + 1}`,
                                            name: `Chamber ${i + 1}`
                                          }))
                                      )
                                        .slice(0, chamberLimit)
                                        .map((ch, i) => (
                                          <span key={ch.id || ch.chamber_name || i} className="do-prof-ch-pill">
                                            {String(ch.chamber_name || ch.name || `Ch-${i + 1}`)
                                              .replace(/^Chamber\s+/i, 'Ch-')
                                              .replace(/^Ch\s+/i, 'Ch-')}
                                          </span>
                                        ))}
                                    </div>
                                  </div>

                                  <div className="do-prof-card">
                                    <h3>Client Mapping</h3>
                                    <div className="do-prof-map-overview-stats">
                                      <div className="do-prof-map-stat-card wh">
                                        <span className="do-prof-map-stat-icon" aria-hidden="true">
                                          <Users size={16} strokeWidth={2.2} />
                                        </span>
                                        <div className="do-prof-map-stat-body">
                                          <em>Total Clients</em>
                                          <strong>{mappingTotalClients}</strong>
                                          <span className="do-prof-map-stat-sub">Unique mapped</span>
                                        </div>
                                      </div>
                                      <div className="do-prof-map-stat-card ok">
                                        <span className="do-prof-map-stat-icon" aria-hidden="true">
                                          <CheckCircle2 size={16} strokeWidth={2.2} />
                                        </span>
                                        <div className="do-prof-map-stat-body">
                                          <em>Active Clients</em>
                                          <strong>{mappingActiveClients.length}</strong>
                                          <span className="do-prof-map-stat-sub">In chambers</span>
                                        </div>
                                      </div>
                                      <div className="do-prof-map-stat-card warn">
                                        <span className="do-prof-map-stat-icon" aria-hidden="true">
                                          <UserX size={16} strokeWidth={2.2} />
                                        </span>
                                        <div className="do-prof-map-stat-body">
                                          <em>Inactive Clients</em>
                                          <strong>{mappingInactiveClients.length}</strong>
                                          <span className="do-prof-map-stat-sub">Not mapped</span>
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="do-prof-btn"
                                      style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                                      onClick={() => setOpProfileSection('mappings')}
                                    >
                                      Open Client Mapping
                                    </button>
                                  </div>

                                  <div className="do-prof-card">
                                    <h3>Notes / Remarks</h3>
                                    <p className="do-prof-notes">
                                      Regular operator profile. Warehouse access and chamber limit are managed from Edit.
                                      <em>
                                        Next review:{' '}
                                        {op.created_at
                                          ? new Date(
                                              new Date(op.created_at).getTime() + 90 * 86400000
                                            ).toLocaleDateString('en-GB')
                                          : '—'}
                                      </em>
                                    </p>
                                  </div>
                                </div>
                              </div>
                          </div>
                        </section>
                      </div>
                    )}

                    {opProfileSection === 'task_status' && (
                    <div className="do-prof-card do-prof-panel-wrap do-prof-task-panel">
                      <div className="do-prof-section-head">
                        <div>
                          <h3>Chamber Task Status</h3>
                          <p className="do-prof-range-label" style={{ margin: '4px 0 0' }}>
                            Morning &amp; Evening inspections
                            {' · '}
                            <strong>{periodLabel}</strong>
                            {' · '}
                            {opTaskStatus.assignmentCount} active client
                            {opTaskStatus.assignmentCount === 1 ? '' : 's'}
                            {!opTaskLogsLoading && opActiveAssignments.length > 0
                              ? ` · ${opTaskLogs.length} log${opTaskLogs.length === 1 ? '' : 's'} loaded`
                              : ''}
                          </p>
                        </div>
                        <div className="do-prof-task-head-actions">
                          <span
                            className={`do-prof-pill ${
                              opTaskStatus.statusTone === 'good'
                                ? 'ok'
                                : opTaskStatus.statusTone === 'bad'
                                  ? 'bad'
                                  : opTaskStatus.statusTone === 'warn' || opTaskStatus.statusTone === 'mixed'
                                    ? 'warn'
                                    : 'idle'
                            }`}
                          >
                            {opTaskStatus.statusLabel}
                          </span>
                          <button
                            type="button"
                            className="do-prof-btn primary"
                            style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                            disabled={filteredOpTasks.length === 0 || opTaskLogsLoading}
                            title="Download Chamber Task Status as Excel sheet (.csv)"
                            onClick={() => {
                              try {
                                const taskGroupMap = {};
                                filteredOpTasks.forEach((task) => {
                                  const key = String(task.date || '—');
                                  if (!taskGroupMap[key]) {
                                    taskGroupMap[key] = {
                                      date: task.date,
                                      morning: { done: 0, expected: 0, overdue: 0 },
                                      evening: { done: 0, expected: 0, overdue: 0 },
                                      overdue: 0,
                                      pending: 0
                                    };
                                  }
                                  const g = taskGroupMap[key];
                                  const shift = String(task.shift || '').toLowerCase();
                                  const bucket = shift.includes('eve')
                                    ? g.evening
                                    : shift.includes('morn')
                                      ? g.morning
                                      : null;
                                  if (!bucket) return;
                                  bucket.expected += 1;
                                  if (task.status === 'completed') {
                                    bucket.done += 1;
                                  } else if (task.status === 'overdue') {
                                    bucket.overdue += 1;
                                    g.overdue += 1;
                                  } else if (task.status === 'pending') {
                                    g.pending += 1;
                                  }
                                });
                                const exportRows = Object.values(taskGroupMap).sort((a, b) =>
                                  String(b.date || '').localeCompare(String(a.date || ''))
                                );
                                if (!confirmExportSize(exportRows.length)) return;
                                const headers = [
                                  'Date',
                                  'Morning (done/expected)',
                                  'Evening (done/expected)',
                                  'Total Task',
                                  'Inward',
                                  'Outward',
                                  'Status'
                                ];
                                const rows = exportRows.map((row) => {
                                  const expected = row.morning.expected + row.evening.expected;
                                  const done = row.morning.done + row.evening.done;
                                  const dayIo = ioForDate(row.date);
                                  const stLabel =
                                    row.overdue > 0
                                      ? 'Overdue'
                                      : row.pending > 0
                                        ? 'Pending'
                                        : expected > 0 && done === expected
                                          ? 'Completed'
                                          : '—';
                                  return [
                                    formatDateStr(row.date),
                                    excelRatioText(row.morning.done, row.morning.expected),
                                    excelRatioText(row.evening.done, row.evening.expected),
                                    expected,
                                    dayIo.in,
                                    dayIo.out,
                                    stLabel
                                  ];
                                });
                                const csv = toCsvContent(headers, rows);
                                const doCode = `DO-${String(op.id || '').padStart(3, '0')}`;
                                const fromPart = opTaskAppliedFrom || 'all';
                                const toPart = opTaskAppliedTo || 'all';
                                downloadCsv(
                                  `${doCode}_Chamber_Task_Status_${fromPart}_to_${toPart}.csv`,
                                  csv
                                );
                              } catch (err) {
                                window.alert(getExportErrorMessage(err));
                              }
                            }}
                          >
                            <Download size={13} />
                            Export Excel Sheet
                          </button>
                        </div>
                      </div>

                      <div className="do-prof-task-toolbar">
                        <div className="do-prof-daterange">
                          <Calendar size={14} />
                          <input
                            type="date"
                            value={opTaskFromDate}
                            max={opTaskToDate || localDateStr()}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOpTaskFromDate(val);
                              if (val && opTaskToDate && val > opTaskToDate) setOpTaskToDate(val);
                            }}
                            title="From date"
                          />
                          <span>→</span>
                          <input
                            type="date"
                            value={opTaskToDate}
                            min={opTaskFromDate || undefined}
                            max={localDateStr()}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOpTaskToDate(val);
                              if (val && opTaskFromDate && val < opTaskFromDate) setOpTaskFromDate(val);
                            }}
                            title="To date"
                          />
                          <button
                            type="button"
                            className="do-prof-btn primary"
                            style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                            onClick={() => applyOpTaskDateRange(op, opTaskFromDate, opTaskToDate)}
                            disabled={opTaskLogsLoading || !opTaskFromDate || !opTaskToDate}
                          >
                            Apply
                          </button>
                        </div>
                        <div className="do-prof-task-toolbar-actions">
                          <button
                            type="button"
                            className="do-prof-btn"
                            style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                            onClick={() => {
                              const { fromDate, toDate } = getDefaultOpTaskRange(1);
                              applyOpTaskDateRange(op, fromDate, toDate);
                            }}
                            disabled={opTaskLogsLoading}
                            title="Reset to today"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="do-prof-btn"
                            style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                            onClick={() => loadOpTaskStatus(op, opTaskAppliedFrom, opTaskAppliedTo)}
                            disabled={opTaskLogsLoading}
                          >
                            <RefreshCw size={13} />
                            {opTaskLogsLoading ? 'Refreshing…' : 'Refresh'}
                          </button>
                          {[
                            { days: 1, label: 'Today' },
                            { days: 7, label: '7 days' },
                            { days: 30, label: '30 days' }
                          ].map((preset) => {
                            const range = getDefaultOpTaskRange(preset.days);
                            const active =
                              opTaskAppliedFrom === range.fromDate && opTaskAppliedTo === range.toDate;
                            return (
                              <button
                                key={preset.days}
                                type="button"
                                className={`do-prof-chip${active ? ' active' : ''}`}
                                onClick={() => applyOpTaskDateRange(op, range.fromDate, range.toDate)}
                                disabled={opTaskLogsLoading}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="do-prof-task-count-grid do-prof-task-count-grid-4">
                        <div className="do-prof-task-count all">
                          <span>Total</span>
                          <strong>{opTaskStatus.total}</strong>
                        </div>
                        <div className="do-prof-task-count ok">
                          <span>Completed</span>
                          <strong>{opTaskStatus.completed}</strong>
                        </div>
                        <div className="do-prof-task-count warn">
                          <span>Pending</span>
                          <strong>{opTaskStatus.pending}</strong>
                        </div>
                        <div className="do-prof-task-count bad">
                          <span>Overdue</span>
                          <strong>{opTaskStatus.overdue}</strong>
                        </div>
                      </div>

                      {opTaskLogsError && (
                        <div className="do-prof-empty" style={{ color: '#b91c1c' }}>{opTaskLogsError}</div>
                      )}

                      {!op.warehouse_name ? (
                        <div className="do-prof-empty">Configure warehouse access to track chamber tasks.</div>
                      ) : opMappingsLoading && opActiveAssignments.length === 0 ? (
                        <SaDataLoading label="Loading assignments…" compact />
                      ) : opActiveAssignments.length === 0 ? (
                        <div className="do-prof-empty">No active chamber clients assigned for this operator.</div>
                      ) : opTaskLogsLoading && opTaskStatus.total === 0 ? (
                        <SaDataLoading label="Loading task status…" compact />
                      ) : (
                        <>
                          <div className="do-prof-task-tools">
                            <div className="do-prof-chips">
                              {[
                                { id: 'all', label: 'All', count: opTaskStatus.total },
                                { id: 'completed', label: 'Completed', count: opTaskStatus.completed },
                                { id: 'pending', label: 'Pending', count: opTaskStatus.pending },
                                { id: 'overdue', label: 'Overdue', count: opTaskStatus.overdue }
                              ].map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={`do-prof-chip${opTaskFilter === item.id ? ' active' : ''}`}
                                  onClick={() => {
                                    setOpTaskFilter(item.id);
                                    setOpTaskListPage(1);
                                  }}
                                >
                                  {item.label} ({item.count})
                                </button>
                              ))}
                            </div>
                            <label className="do-prof-chamber-filter">
                              <span>Chamber</span>
                              <select
                                value={opTaskChamberFilter}
                                onChange={(e) => {
                                  setOpTaskChamberFilter(e.target.value);
                                  setOpTaskListPage(1);
                                }}
                                title="Filter by chamber"
                                aria-label="Filter by chamber"
                              >
                                <option value="all">All</option>
                                {opTaskChamberOptions.map((chamberName) => (
                                  <option key={chamberName} value={chamberName}>
                                    {chamberName}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          {filteredOpTasks.length === 0 ? (
                            <div className="do-prof-empty">No tasks in this filter for the selected dates.</div>
                          ) : (
                            (() => {
                              const taskGroupMap = {};
                              filteredOpTasks.forEach((task) => {
                                const key = String(task.date || '—');
                                if (!taskGroupMap[key]) {
                                  taskGroupMap[key] = {
                                    date: task.date,
                                    morning: { done: 0, expected: 0, overdue: 0, viewTask: null },
                                    evening: { done: 0, expected: 0, overdue: 0, viewTask: null },
                                    overdue: 0,
                                    pending: 0,
                                    completed: 0
                                  };
                                }
                                const g = taskGroupMap[key];
                                const shift = String(task.shift || '').toLowerCase();
                                const bucket = shift.includes('eve')
                                  ? g.evening
                                  : shift.includes('morn')
                                    ? g.morning
                                    : null;
                                if (!bucket) return;
                                bucket.expected += 1;
                                if (task.status === 'completed') {
                                  bucket.done += 1;
                                  g.completed += 1;
                                  if (!bucket.viewTask && (task.log || task.reference_no)) {
                                    bucket.viewTask = task;
                                  }
                                } else if (task.status === 'overdue') {
                                  bucket.overdue += 1;
                                  g.overdue += 1;
                                } else if (task.status === 'pending') {
                                  g.pending += 1;
                                }
                              });
                              const taskGroupRows = Object.values(taskGroupMap).sort((a, b) =>
                                String(b.date || '').localeCompare(String(a.date || ''))
                              );
                              const shiftDoneExpected = (bucket) => {
                                if (!bucket || bucket.expected === 0) return { label: '—', tone: 'idle' };
                                const label = `${bucket.done}/${bucket.expected}`;
                                if (bucket.done === bucket.expected) return { label, tone: 'ok' };
                                if (bucket.overdue > 0) return { label, tone: 'bad' };
                                return { label, tone: 'warn' };
                              };
                              const pagedGroups = taskGroupRows.slice(
                                (Math.max(1, opTaskListPage) - 1) * 15,
                                Math.max(1, opTaskListPage) * 15
                              );
                              return (
                            <>
                              <div className="do-prof-table-wrap">
                                <table className="do-prof-table">
                                  <thead>
                                    <tr>
                                      <th>Date</th>
                                      <th>
                                        Morning
                                        <span className="do-prof-th-sub">done/expected</span>
                                      </th>
                                      <th>
                                        Evening
                                        <span className="do-prof-th-sub">done/expected</span>
                                      </th>
                                      <th>Total Task</th>
                                      <th>Inward</th>
                                      <th>Outward</th>
                                      <th>Status</th>
                                      <th>View</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pagedGroups.map((row) => {
                                      const morn = shiftDoneExpected(row.morning);
                                      const eve = shiftDoneExpected(row.evening);
                                      const expected = row.morning.expected + row.evening.expected;
                                      const done = row.morning.done + row.evening.done;
                                      const dayIo = ioForDate(row.date);
                                      const st =
                                        row.overdue > 0
                                          ? 'bad'
                                          : row.pending > 0
                                            ? 'warn'
                                            : expected > 0 && done === expected
                                              ? 'ok'
                                              : 'idle';
                                      const stLabel =
                                        st === 'bad'
                                          ? 'Overdue'
                                          : st === 'warn'
                                            ? 'Pending'
                                            : st === 'ok'
                                              ? 'Completed'
                                              : '—';
                                      const viewTask = row.morning.viewTask || row.evening.viewTask;
                                      return (
                                        <tr key={row.date || 'unknown'}>
                                          <td>{formatDateStr(row.date)}</td>
                                          <td>
                                            <span className={`do-prof-pill ${morn.tone}`}>{morn.label}</span>
                                          </td>
                                          <td>
                                            <span className={`do-prof-pill ${eve.tone}`}>{eve.label}</span>
                                          </td>
                                          <td>
                                            <strong>{expected}</strong>
                                          </td>
                                          <td>{dayIo.in}</td>
                                          <td>{dayIo.out}</td>
                                          <td>
                                            <span className={`do-prof-pill ${st}`}>{stLabel}</span>
                                          </td>
                                          <td>
                                            {viewTask ? (
                                              <button
                                                type="button"
                                                className="do-prof-link"
                                                onClick={() => openChamberTaskProfile(viewTask, op)}
                                                title="Open log profile"
                                              >
                                                <Eye size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                                View
                                              </button>
                                            ) : (
                                              <span className="do-prof-muted">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <PaginationBar
                                page={opTaskListPage}
                                totalItems={taskGroupRows.length}
                                pageSize={15}
                                onPageChange={setOpTaskListPage}
                                itemLabel="days"
                              />
                            </>
                              );
                            })()
                          )}
                        </>
                      )}
                    </div>
                    )}

                    {opProfileSection === 'mappings' && (
                    <div className="do-prof-card do-prof-panel-wrap do-prof-map-panel">
                      <div className="do-prof-section-head do-prof-map-head">
                        <div>
                          <h3>Chamber &amp; Client Mappings</h3>
                          <p className="do-prof-range-label" style={{ margin: '4px 0 0' }}>
                            {op.warehouse_name
                              ? `Manage which clients are assigned to which chambers at ${op.warehouse_name}.`
                              : 'Configure warehouse access to see chamber mappings.'}
                          </p>
                        </div>
                      </div>

                      {opMappingsError && (
                        <div className="do-prof-empty" style={{ color: '#b91c1c' }}>{opMappingsError}</div>
                      )}
                      {opMappingsSuccess && opMasterEditMode && (
                        <div className="do-prof-empty" style={{ color: '#047857' }}>{opMappingsSuccess}</div>
                      )}

                      {!op.warehouse_name ? (
                        <div className="do-prof-empty">Warehouse is not configured for this operator.</div>
                      ) : opMappingsLoading ? (
                        <SaDataLoading label={`Loading mappings for ${op.warehouse_name}…`} compact />
                      ) : (
                        (() => {
                          const chamberLimit = Number(op.chamber_limit) || 4;
                          const chamberMeta = opDisplayChambers.map((chamberRow, chamberIdx) => {
                            const chamberAssignments = opMappings.filter((m) =>
                              assignmentMatchesDisplayChamber(m, chamberRow)
                            );
                            const activeClients = uniqueClientsByName(
                              chamberAssignments.filter((m) => !isDeactiveAssignment(m))
                            );
                            const activeNames = new Set(
                              activeClients.map((m) => String(m.client_name || '').trim().toLowerCase())
                            );
                            const deactiveClients = uniqueClientsByName(
                              chamberAssignments.filter(
                                (m) =>
                                  isDeactiveAssignment(m) &&
                                  !activeNames.has(String(m.client_name || '').trim().toLowerCase())
                              )
                            );
                            const chamberType =
                              activeClients[0]?.chamber_type ||
                              deactiveClients[0]?.chamber_type ||
                              (chamberRow.chamberNum != null ? opChamberTypeByNum[chamberRow.chamberNum] : null) ||
                              (chamberRow.chamberNum != null ? newChamberTypes[chamberRow.chamberNum] : null) ||
                              chamberRow.chamber_type ||
                              'Frozen';
                            return {
                              chamberRow,
                              chamberIdx,
                              activeClients,
                              deactiveClients,
                              chamberType,
                              resolvedChamberId: chamberRow.id,
                              typeEditKey:
                                chamberRow.chamberNum != null
                                  ? chamberRow.chamberNum
                                  : `id-${chamberRow.id}`
                            };
                          });
                          const mappingActiveUnique = uniqueClientsByName(
                            (opMappings || []).filter((m) => !isDeactiveAssignment(m))
                          );
                          const mappingActiveNameSet = new Set(
                            mappingActiveUnique.map((m) =>
                              String(m.client_name || '').trim().toLowerCase()
                            )
                          );
                          const mappingInactiveUnique = uniqueClientsByName(
                            (opMappings || []).filter(
                              (m) =>
                                isDeactiveAssignment(m) &&
                                !mappingActiveNameSet.has(
                                  String(m.client_name || '').trim().toLowerCase()
                                )
                            )
                          );
                          const mappingSummary = {
                            total: mappingActiveUnique.length + mappingInactiveUnique.length,
                            active: mappingActiveUnique.length,
                            deactive: mappingInactiveUnique.length
                          };
                          const searchQ = String(opMapSearch || '').trim().toLowerCase();
                          const filteredMeta = chamberMeta.filter((row) => {
                            if (
                              opMapChamberFilter !== 'all' &&
                              String(row.chamberRow.name || '') !== opMapChamberFilter
                            ) {
                              return false;
                            }
                            if (!searchQ) return true;
                            const hay = [
                              row.chamberRow.name,
                              row.chamberType,
                              op.warehouse_name,
                              ...row.activeClients.map((c) => c.client_name),
                              ...row.deactiveClients.map((c) => c.client_name)
                            ]
                              .join(' ')
                              .toLowerCase();
                            return hay.includes(searchQ);
                          });
                          const tempForType = (type) => {
                            const zone = pickComplianceZone(type) || 'Frozen';
                            if (zone === 'Frozen') return '-18 to -22';
                            if (zone === 'Chilled') return '-5 to 5';
                            if (zone === 'Dry') return '15 to 25';
                            if (zone === 'Other') return '0 to 40';
                            return '—';
                          };
                          const indexTone = (idx) => ['blue', 'purple', 'cyan', 'orange'][idx % 4];
                          const CLIENT_PREVIEW = 6;
                          return (
                        <>
                          <div className="do-prof-map-stats">
                            <div className="do-prof-map-stat-card wh">
                              <span className="do-prof-map-stat-icon" aria-hidden="true">
                                <Users size={18} strokeWidth={2.2} />
                              </span>
                              <div className="do-prof-map-stat-body">
                                <em>Total Clients</em>
                                <strong>{mappingSummary.total}</strong>
                                <span className="do-prof-map-stat-sub">
                                  {op.warehouse_name || 'Unique mapped'}
                                </span>
                              </div>
                            </div>
                            <div className="do-prof-map-stat-card ch">
                              <span className="do-prof-map-stat-icon" aria-hidden="true">
                                <LayoutGrid size={18} strokeWidth={2.2} />
                              </span>
                              <div className="do-prof-map-stat-body">
                                <em>Total Chambers</em>
                                <strong>{opDisplayChambers.length} / {chamberLimit}</strong>
                                <span className="do-prof-map-stat-sub">In Use</span>
                              </div>
                            </div>
                            <div className="do-prof-map-stat-card ok">
                              <span className="do-prof-map-stat-icon" aria-hidden="true">
                                <CheckCircle2 size={18} strokeWidth={2.2} />
                              </span>
                              <div className="do-prof-map-stat-body">
                                <em>Active Clients</em>
                                <strong>{mappingSummary.active}</strong>
                                <span className="do-prof-map-stat-sub">Across Chambers</span>
                              </div>
                            </div>
                            <div className="do-prof-map-stat-card warn">
                              <span className="do-prof-map-stat-icon" aria-hidden="true">
                                <UserX size={18} strokeWidth={2.2} />
                              </span>
                              <div className="do-prof-map-stat-body">
                                <em>Inactive Clients</em>
                                <strong>{mappingSummary.deactive}</strong>
                                <span className="do-prof-map-stat-sub">Not Mapped</span>
                              </div>
                            </div>
                          </div>

                          <div className="do-prof-map-toolbar">
                            <label className="do-prof-map-select">
                              <MapPin size={14} />
                              <select value={op.warehouse_name || ''} disabled title="Assigned warehouse">
                                <option>{op.warehouse_name}</option>
                              </select>
                            </label>
                            <label className="do-prof-map-select">
                              <LayoutGrid size={14} />
                              <select
                                value={opMapChamberFilter}
                                onChange={(e) => setOpMapChamberFilter(e.target.value)}
                                aria-label="Filter by chamber"
                              >
                                <option value="all">All Chambers</option>
                                {opDisplayChambers.map((ch) => (
                                  <option key={ch.slotKey || ch.name} value={ch.name}>
                                    {ch.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="do-prof-map-search">
                              <Search size={14} />
                              <input
                                type="search"
                                placeholder="Search client, chamber or warehouse..."
                                value={opMapSearch}
                                onChange={(e) => setOpMapSearch(e.target.value)}
                                aria-label="Search mappings"
                              />
                            </label>
                            <button
                              type="button"
                              className="do-prof-btn"
                              style={{ height: 36, padding: '0 12px', fontSize: 12 }}
                              onClick={() => handleExportOpChamberClientMappings(op)}
                              disabled={opMappingsLoading || !op.warehouse_name}
                              title="Export Excel sheet"
                            >
                              <Download size={14} />
                              Export Excel Sheet
                            </button>
                            <button
                              type="button"
                              className="do-prof-btn primary"
                              style={{ height: 36, padding: '0 14px', fontSize: 12 }}
                              onClick={() => {
                                setOpMappingsError('');
                                setOpMappingsSuccess('');
                                setOpMasterSessionChanges([]);
                                setOpMasterEditChamberKey('__add__');
                                setOpMasterEditMode(true);
                              }}
                            >
                              <Plus size={14} />
                              Add Mapping
                            </button>
                          </div>

                          {opMasterEditChamberKey === '__add__' ? (
                            <div className="do-prof-map-add-chamber">
                              <div className="do-prof-map-add-chamber-head">
                                <strong>Add chamber</strong>
                                <div className="do-prof-map-edit-btns do-prof-map-edit-btns-end">
                                  <button
                                    type="button"
                                    className="do-prof-map-action-btn cancel"
                                    onClick={cancelOpMasterEdit}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="do-prof-map-action-btn done"
                                    onClick={() => finishOpMasterEdit(op)}
                                  >
                                    Done
                                  </button>
                                </div>
                              </div>
                              <div className="do-prof-map-add-chamber-row">
                                <input
                                  type="text"
                                  placeholder={`e.g. Chamber ${chamberLimit + 1}`}
                                  value={opNewChamberName}
                                  onChange={(e) => setOpNewChamberName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddOpChamber(op);
                                    }
                                  }}
                                />
                                <select
                                  value={opNewChamberType}
                                  onChange={(e) => setOpNewChamberType(e.target.value)}
                                >
                                  <option value="Frozen">Frozen</option>
                                  <option value="Chilled">Chilled</option>
                                  <option value="Dry">Dry</option>
                                  <option value="Other">Other</option>
                                </select>
                                <button
                                  type="button"
                                  className="do-prof-btn primary"
                                  disabled={addingOpChamber}
                                  onClick={() => handleAddOpChamber(op)}
                                >
                                  {addingOpChamber ? 'Adding…' : 'Add chamber'}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {filteredMeta.length === 0 ? (
                            <div className="do-prof-empty">
                              {opDisplayChambers.length === 0
                                ? opMasterEditChamberKey === '__add__'
                                  ? 'No chambers yet — use Add chamber above.'
                                  : 'No chambers assigned yet. Open Add Mapping to add one.'
                                : 'No chambers match this search or filter.'}
                            </div>
                          ) : (
                            <div className="do-prof-map-chambers">
                              {filteredMeta.map((meta) => {
                            const {
                              chamberRow,
                              chamberIdx,
                              activeClients,
                              deactiveClients,
                              chamberType,
                              resolvedChamberId,
                              typeEditKey
                            } = meta;
                            const chamberName = chamberRow.name;
                            const chamberNum = chamberRow.chamberNum;
                            const chamberEditing = opMasterEditChamberKey === chamberRow.slotKey;
                            const typeZone = pickComplianceZone(chamberType) || chamberType || 'Frozen';
                            const typeTone =
                              String(typeZone).toLowerCase() === 'chilled'
                                ? 'chilled'
                                : String(typeZone).toLowerCase() === 'dry'
                                  ? 'dry'
                                  : String(typeZone).toLowerCase() === 'other'
                                    ? 'other'
                                    : 'frozen';
                            const allClients = [
                              ...activeClients.map((c) => ({ ...c, _status: 'active' })),
                              ...deactiveClients.map((c) => ({ ...c, _status: 'inactive' }))
                            ];
                            const expanded = Boolean(opMapExpanded[chamberRow.slotKey]);
                            const visibleClients = expanded
                              ? allClients
                              : allClients.slice(0, CLIENT_PREVIEW);
                            return (
                              <div key={chamberRow.slotKey} className="do-prof-map-chamber">
                                <div className="do-prof-map-chamber-top">
                                  <div className="do-prof-map-chamber-id">
                                    <span className={`do-prof-map-index ${indexTone(chamberIdx)}`}>
                                      {chamberIdx + 1}
                                    </span>
                                    <div>
                                      <div className="do-prof-map-chamber-name">
                                        <strong>{chamberName}</strong>
                                      </div>
                                      <p className="do-prof-map-chamber-sub">
                                        <span className={`do-prof-map-type-box ${typeTone}`}>
                                          Type: {typeZone}
                                        </span>
                                        <span className="do-prof-map-sub-sep">·</span>
                                        Temp range: {tempForType(chamberType)}°C
                                        <span className="do-prof-map-sub-sep">·</span>
                                        Warehouse: {op.warehouse_name}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="do-prof-map-chamber-metrics">
                                    <div className="do-prof-map-metric active">
                                      <Users size={13} />
                                      <span>Active Clients</span>
                                      <strong>{activeClients.length}</strong>
                                    </div>
                                    <div className="do-prof-map-metric inactive">
                                      <UserX size={13} />
                                      <span>Inactive Clients</span>
                                      <strong>{deactiveClients.length}</strong>
                                    </div>
                                  </div>
                                  <div className="do-prof-map-chamber-actions">
                                    {chamberEditing ? (
                                      <>
                                        <span className="do-prof-map-status-btn active">Active</span>
                                        <button
                                          type="button"
                                          className="do-prof-map-action-btn inactive"
                                          disabled={
                                            !!pendingMasterDelete &&
                                            pendingMasterDelete.kind === 'chamber' &&
                                            Number(pendingMasterDelete.chamberId) === Number(resolvedChamberId)
                                          }
                                          title={`Mark ${chamberName} inactive`}
                                          onClick={() =>
                                            handleDeleteOpChamber(op, resolvedChamberId, chamberName)
                                          }
                                        >
                                          Inactive
                                        </button>
                                        <div className="do-prof-map-edit-btns do-prof-map-edit-btns-end">
                                          <button
                                            type="button"
                                            className="do-prof-map-action-btn cancel"
                                            onClick={cancelOpMasterEdit}
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            className="do-prof-map-action-btn done"
                                            onClick={() => finishOpMasterEdit(op)}
                                          >
                                            Done
                                          </button>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <span className="do-prof-map-status-btn active">Active</span>
                                        <button
                                          type="button"
                                          className="do-prof-icon-btn"
                                          title={`Edit ${chamberName}`}
                                          onClick={() => {
                                            setOpMappingsError('');
                                            setOpMappingsSuccess('');
                                            setOpMasterSessionChanges([]);
                                            setOpMasterEditChamberKey(chamberRow.slotKey);
                                            setOpMasterEditMode(true);
                                          }}
                                        >
                                          <MoreVertical size={16} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {chamberEditing ? (
                                  <div className="do-prof-map-type-row">
                                    <span>Chamber type</span>
                                    <select
                                      value={
                                        (chamberNum != null ? newChamberTypes[chamberNum] : newChamberTypes[typeEditKey]) ||
                                        chamberType ||
                                        'Frozen'
                                      }
                                      onChange={(e) =>
                                        setNewChamberTypes((prev) => ({
                                          ...prev,
                                          [typeEditKey]: e.target.value,
                                          ...(chamberNum != null ? { [chamberNum]: e.target.value } : {})
                                        }))
                                      }
                                    >
                                      <option value="Frozen">Frozen</option>
                                      <option value="Chilled">Chilled</option>
                                      <option value="Dry">Dry</option>
                                      <option value="Other">Other</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="do-prof-btn"
                                      style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                                      disabled={
                                        updatingChamberTypeKey === typeEditKey ||
                                        String(
                                          (chamberNum != null ? newChamberTypes[chamberNum] : newChamberTypes[typeEditKey]) ||
                                            chamberType
                                        ) === String(chamberType)
                                      }
                                      onClick={() =>
                                        handleUpdateOpChamberType(
                                          op,
                                          resolvedChamberId,
                                          chamberName,
                                          chamberType,
                                          typeEditKey
                                        )
                                      }
                                    >
                                      {updatingChamberTypeKey === typeEditKey ? 'Saving...' : 'Update type'}
                                    </button>
                                  </div>
                                ) : null}

                                <div className="do-prof-map-clients-block">
                                  <div className="do-prof-map-clients-head">
                                    <strong>
                                      <Users size={14} />
                                      Assigned Clients ({allClients.length})
                                    </strong>
                                    {allClients.length > CLIENT_PREVIEW ? (
                                      <button
                                        type="button"
                                        className="do-prof-link"
                                        onClick={() =>
                                          setOpMapExpanded((prev) => ({
                                            ...prev,
                                            [chamberRow.slotKey]: !expanded
                                          }))
                                        }
                                      >
                                        {expanded
                                          ? 'Show less'
                                          : `View All (${allClients.length}) →`}
                                      </button>
                                    ) : null}
                                  </div>

                                  {allClients.length === 0 && !chamberEditing ? (
                                    <div className="do-prof-empty" style={{ padding: '12px 0' }}>
                                      No clients in this chamber yet.
                                    </div>
                                  ) : (
                                    <div className="do-prof-map-client-grid">
                                      {visibleClients.map((assign, aIdx) => (
                                        <div
                                          key={`${assign._status}-${assign.client_name}-${aIdx}`}
                                          className={`do-prof-map-client-chip${assign._status === 'inactive' ? ' inactive' : ''}`}
                                        >
                                          <span>{assign.client_name}</span>
                                          <em className={assign._status === 'inactive' ? 'bad' : 'ok'}>
                                            · {assign._status === 'inactive' ? 'Inactive' : 'Active'}
                                          </em>
                                          {chamberEditing && assign._status === 'active' ? (
                                            <button
                                              type="button"
                                              className="do-prof-map-action-btn inactive sm"
                                              title={`Mark ${assign.client_name} inactive`}
                                              onClick={() =>
                                                handleDeleteOpMapping(
                                                  op,
                                                  assign.chamber_id || resolvedChamberId,
                                                  assign.client_name,
                                                  chamberName
                                                )
                                              }
                                            >
                                              Inactive
                                            </button>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {chamberEditing ? (
                                    <div className="do-prof-map-add-client">
                                      <input
                                        type="text"
                                        placeholder={`Add client to ${chamberName}`}
                                        value={newClientInputs[typeEditKey] || ''}
                                        onChange={(e) =>
                                          setNewClientInputs((prev) => ({ ...prev, [typeEditKey]: e.target.value }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddOpMapping(op, resolvedChamberId, chamberName, typeEditKey);
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="do-prof-btn primary"
                                        style={{ height: 34, padding: '0 12px', fontSize: 12 }}
                                        disabled={
                                          addingMappingChamberId === resolvedChamberId ||
                                          addingMappingChamberId === typeEditKey
                                        }
                                        onClick={() =>
                                          handleAddOpMapping(op, resolvedChamberId, chamberName, typeEditKey)
                                        }
                                      >
                                        {addingMappingChamberId === resolvedChamberId ||
                                        addingMappingChamberId === typeEditKey
                                          ? 'Adding...'
                                          : 'Add client'}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                              })}
                            </div>
                          )}
                        </>
                          );
                        })()
                      )}
                    </div>
                    )}

                    {opProfileSection === 'master_activity' && (
                    <div className="do-gmail-panel do-prof-panel-wrap do-prof-card">
                      <div className="do-gmail-toolbar">
                        <div>
                          <h3 className="do-gmail-title">Master Setup Activity</h3>
                          <p className="do-gmail-sub">
                            Chamber, client and type changes · {opMasterAppliedFrom || '—'} to {opMasterAppliedTo || '—'}
                          </p>
                        </div>
                      </div>

                      <div className="do-gmail-filters do-gmail-task-filters">
                        <input
                          className="sa-op-filter"
                          type="date"
                          value={opMasterFromDate}
                          max={opMasterToDate || undefined}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOpMasterFromDate(val);
                            if (val && opMasterToDate && val > opMasterToDate) setOpMasterToDate(val);
                          }}
                          title="From date"
                        />
                        <input
                          className="sa-op-filter"
                          type="date"
                          value={opMasterToDate}
                          min={opMasterFromDate || undefined}
                          max={localDateStr()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOpMasterToDate(val);
                            if (val && opMasterFromDate && val < opMasterFromDate) setOpMasterFromDate(val);
                          }}
                          title="To date"
                        />
                        <div className="do-gmail-task-actions">
                          <button
                            type="button"
                            className="do-gmail-task-btn primary"
                            onClick={() => {
                              setOpMasterAppliedFrom(opMasterFromDate);
                              setOpMasterAppliedTo(opMasterToDate);
                              setOpMasterActivityFilter('all');
                              setOpMasterActivityPage(1);
                              loadOpMasterActivities(op.email);
                            }}
                            disabled={opMasterActivitiesLoading || !opMasterFromDate || !opMasterToDate}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            className="do-gmail-task-btn"
                            onClick={() => {
                              const { fromDate, toDate } = getDefaultOpTaskRange(30);
                              setOpMasterFromDate(fromDate);
                              setOpMasterToDate(toDate);
                              setOpMasterAppliedFrom(fromDate);
                              setOpMasterAppliedTo(toDate);
                              setOpMasterActivityFilter('all');
                              setOpMasterActivityPage(1);
                              loadOpMasterActivities(op.email);
                            }}
                            disabled={opMasterActivitiesLoading}
                            title="Reset to last 30 days"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="do-gmail-task-btn"
                            onClick={() => loadOpMasterActivities(op.email)}
                            disabled={opMasterActivitiesLoading}
                          >
                            {opMasterActivitiesLoading ? 'Refreshing…' : 'Refresh'}
                          </button>
                        </div>
                        {[
                          { days: 1, label: 'Today' },
                          { days: 7, label: '7 days' },
                          { days: 30, label: '30 days' }
                        ].map((preset) => {
                          const range = getDefaultOpTaskRange(preset.days);
                          const active =
                            opMasterAppliedFrom === range.fromDate && opMasterAppliedTo === range.toDate;
                          return (
                            <button
                              key={preset.days}
                              type="button"
                              className={`do-gmail-task-btn${active ? ' active' : ''}`}
                              onClick={() => {
                                setOpMasterFromDate(range.fromDate);
                                setOpMasterToDate(range.toDate);
                                setOpMasterAppliedFrom(range.fromDate);
                                setOpMasterAppliedTo(range.toDate);
                                setOpMasterActivityFilter('all');
                                setOpMasterActivityPage(1);
                                loadOpMasterActivities(op.email);
                              }}
                              disabled={opMasterActivitiesLoading}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      {opMasterActivitiesError && (
                        <div className="do-gmail-empty" style={{ color: '#c5221f' }}>{opMasterActivitiesError}</div>
                      )}

                      {(() => {
                        const dateFilteredMasterActivities = profileMasterActivities.filter((act) => {
                          if (!opMasterAppliedFrom && !opMasterAppliedTo) return true;
                          const when = act?.created_at ? new Date(act.created_at) : null;
                          if (!when || Number.isNaN(when.getTime())) return true;
                          const day = localDateStr(when);
                          if (opMasterAppliedFrom && day < opMasterAppliedFrom) return false;
                          if (opMasterAppliedTo && day > opMasterAppliedTo) return false;
                          return true;
                        });
                        return (
                      <>
                      {dateFilteredMasterActivities.length > 0 && (
                        <div className="do-gmail-filters">
                          {MASTER_ACTIVITY_FILTERS.map((item) => {
                            const count = item.id === 'all'
                              ? dateFilteredMasterActivities.length
                              : dateFilteredMasterActivities.filter((act) => masterActivityMatchesFilter(act, item.id)).length;
                            const active = opMasterActivityFilter === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`do-gmail-chip${active ? ' active' : ''}`}
                                onClick={() => {
                                  setOpMasterActivityFilter(item.id);
                                  setOpMasterActivityPage(1);
                                }}
                              >
                                {item.label} {count}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {opMasterActivitiesLoading && dateFilteredMasterActivities.length === 0 ? (
                        <SaDataLoading label="Loading Master Setup activity…" compact />
                      ) : dateFilteredMasterActivities.length === 0 ? (
                        <div className="do-gmail-empty">
                          {profileMasterActivities.length === 0
                            ? 'No Master Setup changes yet for this operator.'
                            : 'No Master Setup activity in the selected date range.'}
                        </div>
                      ) : (
                        (() => {
                          const filteredActs = dateFilteredMasterActivities.filter((act) =>
                            masterActivityMatchesFilter(act, opMasterActivityFilter)
                          );
                          if (filteredActs.length === 0) {
                            return (
                              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                <span>
                                  No {MASTER_ACTIVITY_FILTERS.find((item) => item.id === opMasterActivityFilter)?.label?.toLowerCase() || 'matching'} activity.
                                </span>
                              </div>
                            );
                          }
                          const totalPages = Math.max(1, Math.ceil(filteredActs.length / OP_MASTER_ACTIVITY_PAGE_SIZE));
                          const safePage = Math.min(Math.max(opMasterActivityPage, 1), totalPages);
                          const pagedActs = filteredActs.slice(
                            (safePage - 1) * OP_MASTER_ACTIVITY_PAGE_SIZE,
                            safePage * OP_MASTER_ACTIVITY_PAGE_SIZE
                          );
                          const latestId = filteredActs[0]?.id;
                          return (
                            <>
                            <div style={{ maxHeight: 'min(72vh, 760px)', overflowY: 'auto', overflowX: 'auto' }}>
                              <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-main)' }}>
                                    <th style={{ padding: '6px 8px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Action</th>
                                    <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Chamber</th>
                                    <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Activity Description</th>
                                    <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Remark</th>
                                    <th style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--text-dark)', position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>Timestamp</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedActs.map((act) => {
                                    const parsed = parseMasterActivity(act);
                                    const tone = masterActivityTone(parsed.action);
                                    const isLatest = act.id === latestId;
                                    const changeLines = [];
                                    if (parsed.added.length) changeLines.push({ label: 'Added', value: parsed.added.join(', '), color: '#047857' });
                                    if (parsed.deleted.length) changeLines.push({ label: 'Removed', value: parsed.deleted.join(', '), color: '#b91c1c' });
                                    if (parsed.renamed.length) {
                                      changeLines.push({
                                        label: 'Renamed',
                                        value: parsed.renamed.map((item) => `${item.from} → ${item.to}`).join(', '),
                                        color: '#a16207'
                                      });
                                    }
                                    if (parsed.typeFrom || parsed.typeTo) {
                                      changeLines.push({
                                        label: 'Type',
                                        value: parsed.typeFrom && parsed.typeTo ? `${parsed.typeFrom} → ${parsed.typeTo}` : (parsed.typeTo || parsed.typeFrom),
                                        color: '#1d4ed8'
                                      });
                                    }
                                    return (
                                      <tr key={act.id} style={{ borderBottom: '1px solid var(--border)', backgroundColor: isLatest ? '#f8fbff' : 'transparent' }}>
                                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                            <span style={{
                                              display: 'inline-block',
                                              padding: '1px 6px',
                                              borderRadius: '100px',
                                              fontSize: '0.64rem',
                                              fontWeight: '800',
                                              color: tone.color,
                                              backgroundColor: tone.bg,
                                              textTransform: 'uppercase'
                                            }}>
                                              {parsed.title}
                                            </span>
                                            {isLatest ? (
                                              <span style={{
                                                fontSize: '0.58rem',
                                                fontWeight: 800,
                                                color: '#0369a1',
                                                background: '#e0f2fe',
                                                padding: '1px 6px',
                                                borderRadius: 999,
                                                textTransform: 'uppercase'
                                              }}>
                                                Latest
                                              </span>
                                            ) : null}
                                          </div>
                                        </td>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0f172a' }}>
                                          {parsed.chamber || '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px', color: '#334155' }}>
                                          {changeLines.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                              {changeLines.map((line) => (
                                                <div key={line.label}>
                                                  <span style={{ fontWeight: 800, color: line.color }}>{line.label}: </span>
                                                  <span style={{ fontWeight: 600 }}>{line.value}</span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : highlightAddedDeletedWords(parsed.summary)}
                                        </td>
                                        <td style={{ padding: '6px 8px', color: '#0f766e', fontWeight: 600, fontSize: '0.72rem', maxWidth: 180 }}>
                                          {parsed.remark || '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                          {parsed.when
                                            ? new Date(parsed.when).toLocaleString('en-GB', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit',
                                                hour12: true
                                              })
                                            : '—'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <PaginationBar
                              page={safePage}
                              totalItems={filteredActs.length}
                              pageSize={OP_MASTER_ACTIVITY_PAGE_SIZE}
                              onPageChange={setOpMasterActivityPage}
                              itemLabel="activities"
                            />
                            </>
                          );
                        })()
                      )}
                      </>
                        );
                      })()}
                    </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="sa-op-gmail sa-reg-op" data-ui="register-operator-v2">
                <div className="sa-reg-page-head">
                  <button
                    type="button"
                    className="sa-reg-back"
                    onClick={() => {
                      if (editingOp) cancelEditOperator();
                      else setActiveMenu('dashboard');
                    }}
                    title={editingOp ? 'Cancel edit' : 'Back to dashboard'}
                    aria-label="Back"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h2 className="sa-op-title">
                      {editingOp ? 'Modify Operator Profile' : 'Register New Data Operator'}
                    </h2>
                    <p className="sa-op-sub">
                      {editingOp
                        ? `Update ${editingOp.email || 'operator'} — warehouse and chamber limit apply to profile and logs.`
                        : 'Add a new data operator to the ReeferON system. All fields are required.'}
                    </p>
                  </div>
                </div>

                <section className="sa-op-card sa-reg-details-card">
                  <div className="sa-op-card-head">
                    <div className="sa-op-card-icon">
                      <User size={16} />
                    </div>
                    <h2 className="sa-op-title">Operator Details</h2>
                  </div>

                  <form onSubmit={handleSaveOperator} className="sa-op-form">
                    <div className="sa-op-form-grid cols-3">
                      <label className="sa-op-field">
                        <span>Full Name</span>
                        <div className="sa-reg-input">
                          <User size={15} />
                          <input
                            type="text"
                            name="op-full-name"
                            inputMode="text"
                            autoComplete="name"
                            placeholder="e.g. John Doe"
                            value={opFullName}
                            onChange={(e) => setOpFullName(e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''))}
                            required
                          />
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Phone No.</span>
                        <div className="sa-reg-input sa-reg-input-phone">
                          <div className="sa-op-phone">
                            <span className="sa-op-phone-code">+91</span>
                            <input
                              type="tel"
                              name="op-phone"
                              inputMode="numeric"
                              autoComplete="tel"
                              placeholder="9876543210"
                              maxLength={10}
                              value={opPhoneNo}
                              onChange={(e) => setOpPhoneNo(toLocalTenDigitPhone(e.target.value))}
                              pattern="[0-9]{10}"
                              title="Enter a 10-digit mobile number"
                              required
                            />
                          </div>
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Warehouse / Data Access</span>
                        <div className="sa-reg-input">
                          <Home size={15} />
                          <div className="sa-op-suggest">
                            <input
                              name="op-warehouse"
                              type="text"
                              autoComplete="off"
                              placeholder="Select warehouse / give access"
                              value={opWarehouseName}
                              onChange={(e) => {
                                setOpWarehouseName(e.target.value);
                                setOpWarehouseSuggestOpen(true);
                              }}
                              onFocus={() => setOpWarehouseSuggestOpen(true)}
                              onBlur={() => {
                                window.setTimeout(() => setOpWarehouseSuggestOpen(false), 180);
                              }}
                              required
                              disabled={warehouseSelectOptions.length === 0}
                            />
                            {opWarehouseSuggestOpen &&
                              warehouseSelectOptions.length > 0 &&
                              warehouseTypeSuggestions.length > 0 && (
                                <ul className="sa-op-suggest-list" role="listbox">
                                  {warehouseTypeSuggestions.map((wh) => (
                                    <li key={wh.value}>
                                      <button
                                        type="button"
                                        className={
                                          String(opWarehouseName).trim().toLowerCase() ===
                                          String(wh.value).trim().toLowerCase()
                                            ? 'is-active'
                                            : undefined
                                        }
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setOpWarehouseName(wh.value);
                                          setOpWarehouseSuggestOpen(false);
                                        }}
                                      >
                                        <strong>{wh.value}</strong>
                                        {wh.code ? <span>{wh.code}</span> : null}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                          </div>
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>{editingOp ? 'Password (leave blank to keep)' : 'Password'}</span>
                        <div className="sa-reg-input">
                          <Lock size={15} />
                          <div className="sa-op-password">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              name="op-password"
                              autoComplete="new-password"
                              placeholder={editingOp ? '••••••••' : 'Enter login password'}
                              value={opPassword}
                              onChange={(e) => setOpPassword(e.target.value)}
                              required={!editingOp}
                            />
                            <button
                              type="button"
                              className="sa-op-password-toggle"
                              onClick={() => setShowPassword((prev) => !prev)}
                              title={showPassword ? 'Hide Password' : 'Show Password'}
                            >
                              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Email ID</span>
                        <div className="sa-reg-input">
                          <Mail size={15} />
                          <input
                            type="email"
                            name="op-email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder="e.g. operator@reeferon.com"
                            value={opEmail}
                            onChange={(e) => setOpEmail(e.target.value)}
                            required
                          />
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Chamber Limit</span>
                        <div className="sa-reg-input">
                          <LayoutGrid size={15} />
                          <select
                            value={opChamberLimit}
                            onChange={(e) => setOpChamberLimit(Number(e.target.value) || 4)}
                            required
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Total Chambers Assigned</span>
                        <div className="sa-reg-input">
                          <LayoutGrid size={15} />
                          <select
                            value={opAssignedChambers}
                            onChange={(e) => setOpAssignedChambers(Number(e.target.value) || 4)}
                            required
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Registration Date</span>
                        <div className="sa-reg-input">
                          <Calendar size={15} />
                          <input
                            type="text"
                            className="sa-reg-readonly"
                            readOnly
                            value={
                              editingOp?.created_at
                                ? new Date(editingOp.created_at).toLocaleDateString('en-GB')
                                : new Date().toLocaleDateString('en-GB')
                            }
                            aria-label="Registration date"
                          />
                        </div>
                      </label>

                      <label className="sa-op-field sa-reg-notes-field">
                        <span>Notes / Remarks</span>
                        <div className="sa-reg-textarea-wrap">
                          <FileText size={15} />
                          <textarea
                            name="op-notes"
                            rows={3}
                            placeholder="Optional notes or special instructions..."
                            value={opNotes}
                            onChange={(e) => setOpNotes(e.target.value)}
                          />
                        </div>
                      </label>

                      {warehouseSelectOptions.length === 0 ? (
                        <p className="sa-reg-field-note sa-op-sub">
                          Go to Master Data → Warehouses, add a location, then pick it here.
                        </p>
                      ) : null}
                    </div>

                    <div className="sa-op-form-actions">
                      <button type="button" className="sa-reg-btn-reset" onClick={resetOperatorForm}>
                        <RefreshCw size={14} />
                        Reset
                      </button>
                      {editingOp ? (
                        <button type="button" className="sa-op-btn-text" onClick={cancelEditOperator}>
                          Cancel
                        </button>
                      ) : null}
                      <button
                        type="submit"
                        className={`sa-op-btn-primary${editingOp ? ' update' : ''}`}
                        disabled={savingOp || loadingOps}
                      >
                        {savingOp ? (
                          <>
                            <Loader2 size={14} className="spinner-icon" />
                            {opProcessStatus || 'Processing…'}
                          </>
                        ) : (
                          <>
                            <UserPlus size={14} />
                            {editingOp ? 'Update Operator' : 'Register Operator'}
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="sa-op-card sa-op-directory sa-reg-dir-card">
                  {(() => {
                    const avatarPalette = [
                      { bg: '#dbeafe', color: '#1d4ed8' },
                      { bg: '#ede9fe', color: '#6d28d9' },
                      { bg: '#ccfbf1', color: '#0f766e' },
                      { bg: '#ffedd5', color: '#c2410c' },
                      { bg: '#fce7f3', color: '#be185d' },
                      { bg: '#e0e7ff', color: '#3730a3' }
                    ];
                    const relativeAgo = (iso) => {
                      if (!iso) return '';
                      const t = new Date(iso).getTime();
                      if (Number.isNaN(t)) return '';
                      const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
                      if (days === 0) return 'today';
                      if (days === 1) return '1 day ago';
                      if (days < 60) return `${days} days ago`;
                      const months = Math.round(days / 30);
                      return months === 1 ? '1 month ago' : `${months} months ago`;
                    };
                    const filteredOperators = operators.filter((op) => {
                      const term = operatorSearch.toLowerCase();
                      return (
                        (op.full_name && op.full_name.toLowerCase().includes(term)) ||
                        (op.warehouse_name && op.warehouse_name.toLowerCase().includes(term)) ||
                        (op.email && op.email.toLowerCase().includes(term)) ||
                        (op.phone_no && String(op.phone_no).includes(term.replace(/\D/g, '')))
                      );
                    });
                    return (
                      <>
                        <div className="sa-reg-dir-head">
                          <div className="sa-reg-dir-title">
                            <div className="sa-op-card-icon">
                              <User size={16} />
                            </div>
                            <div>
                              <h2 className="sa-op-title">Registered Operators Directory</h2>
                              <p className="sa-op-sub">
                                {filteredOperators.length} operator{filteredOperators.length === 1 ? '' : 's'}
                              </p>
                            </div>
                          </div>
                          <div className="sa-op-dir-tools">
                            <label className="sa-op-search sa-reg-search">
                              <Search size={15} />
                              <input
                                type="search"
                                placeholder="Search by name, email, warehouse..."
                                value={operatorSearch}
                                onChange={(e) => setOperatorSearch(e.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className="sa-op-btn-export"
                              onClick={handleExportOperatorsDirectory}
                              disabled={!operators || operators.length === 0}
                              title="Export operators directory to CSV"
                            >
                              <Download size={14} />
                              <span>Export</span>
                            </button>
                          </div>
                        </div>

                        {exportError?.retryKey === 'operators' && (
                          <div className="sa-op-banner-wrap">
                            <ExportErrorBanner
                              message={exportError.message}
                              retryable={exportError.retryable}
                              onRetry={retryFailedExport}
                              onDismiss={() => setExportError(null)}
                            />
                          </div>
                        )}
                        {opSuccess && <div className="sa-op-banner success">{opSuccess}</div>}
                        {opError && (
                          <div className="sa-op-banner-wrap">
                            <LoadErrorBanner
                              message={opError}
                              onRetry={loadOperatorsData}
                              onDismiss={() => setOpError('')}
                            />
                          </div>
                        )}

                        {loadingOps ? (
                          <SaDataLoading label="Loading operators…" />
                        ) : filteredOperators.length === 0 ? (
                          <div className="sa-op-empty">
                            <ShieldAlert size={28} />
                            <p>No matching operators found.</p>
                          </div>
                        ) : (
                          <div className="sa-op-inbox">
                            <table className="sa-op-dir-table sa-reg-dir-table">
                              <thead>
                                <tr>
                                  <th>Operator</th>
                                  <th>Email</th>
                                  <th>Phone</th>
                                  <th>Warehouse</th>
                                  <th>Chamber Limit</th>
                                  <th>Registered</th>
                                  <th>Status</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredOperators.map((op, idx) => {
                                  if (!op) return null;
                                  const initials = String(op.full_name || op.email || 'DO')
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((p) => p[0]?.toUpperCase())
                                    .join('') || 'DO';
                                  const tone = avatarPalette[(Number(op.id) || idx) % avatarPalette.length];
                                  const regDate = op.created_at
                                    ? new Date(op.created_at).toLocaleDateString('en-GB')
                                    : '—';
                                  const ago = relativeAgo(op.created_at);
                                  return (
                                    <tr key={op.id} className="sa-op-dir-row">
                                      <td className="sa-op-dir-td-operator">
                                        <button
                                          type="button"
                                          className="sa-op-dir-operator-btn"
                                          onClick={() => openOperatorProfile(op)}
                                          title="View DO Profile"
                                        >
                                          <span
                                            className="sa-op-avatar sa-reg-avatar"
                                            style={{ background: tone.bg, color: tone.color }}
                                          >
                                            {initials}
                                          </span>
                                          <span className="sa-op-sender">
                                            <strong>{op.full_name || 'Unnamed operator'}</strong>
                                            <em>#{op.id}</em>
                                          </span>
                                        </button>
                                      </td>
                                      <td className="sa-op-dir-td-email" title={op.email || ''}>
                                        {op.email || '—'}
                                      </td>
                                      <td className="sa-op-dir-td-phone">
                                        {op.phone_no ? formatIndiaPhoneDisplay(op.phone_no) : '—'}
                                      </td>
                                      <td className="sa-op-dir-td-wh" title={op.warehouse_name || ''}>
                                        <span className="sa-reg-wh-cell">
                                          <Home size={13} />
                                          {op.warehouse_name || 'Not configured'}
                                        </span>
                                      </td>
                                      <td className="sa-op-dir-td-limit">
                                        <span className="sa-reg-limit-pill">{op.chamber_limit || 4}</span>
                                      </td>
                                      <td className="sa-op-dir-td-date">
                                        <span className="sa-reg-date-cell">
                                          {regDate}
                                          {ago ? <span className="sa-reg-ago">, {ago}</span> : null}
                                        </span>
                                      </td>
                                      <td className="sa-op-dir-td-status">
                                        <span className="sa-reg-status">
                                          <span className="sa-reg-status-dot" />
                                          Active
                                        </span>
                                      </td>
                                      <td className="sa-op-dir-td-actions">
                                        <div className="sa-op-row-actions sa-reg-row-actions">
                                          <button type="button" className="sa-op-icon-btn" onClick={() => openOperatorProfile(op)} title="View">
                                            <Eye size={14} />
                                          </button>
                                          <button type="button" className="sa-op-icon-btn" onClick={() => startEditOperator(op)} title="Edit">
                                            <Edit size={14} />
                                          </button>
                                          <div className="sa-reg-more-wrap">
                                            <button
                                              type="button"
                                              className="sa-op-icon-btn"
                                              title="More"
                                              onClick={() => setOpDirMenuId((cur) => (cur === op.id ? null : op.id))}
                                            >
                                              <MoreVertical size={14} />
                                            </button>
                                            {opDirMenuId === op.id ? (
                                              <div className="sa-reg-more-menu">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setOpDirMenuId(null);
                                                    handleDeleteOperator(op);
                                                  }}
                                                >
                                                  <Trash2 size={13} />
                                                  Revoke access
                                                </button>
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </section>
              </div>
            )}
          </div>
        )}

        {/* --- Menu: Customer reports & notes (mobile report inbox, admin replies) --- */}
        {activeMenu === 'customer_reports' && (
          <div className="sa-um">
            <div className="sa-op-gmail sa-reg-op sa-cr-reg" data-ui="customer-reports-v2">
              <div className="sa-reg-page-head">
                <button
                  type="button"
                  className="sa-reg-back"
                  onClick={() => setActiveMenu('dashboard')}
                  title="Back to dashboard"
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h2 className="sa-op-title">Customer Reports</h2>
                  <p className="sa-op-sub">
                    Review customer issue reports and send notes & updates to the mobile portal.
                  </p>
                </div>
              </div>

              <div className="sa-cr-reg-tabs">
                <button
                  type="button"
                  className={`sa-cr-reg-tab${customerReportsTab === 'issues' ? ' active' : ''}`}
                  onClick={() => {
                    setCustomerReportsTab('issues');
                    loadCustomerReportsData();
                  }}
                >
                  <MessageSquareWarning size={14} />
                  Issue reports
                </button>
                <button
                  type="button"
                  className={`sa-cr-reg-tab${customerReportsTab === 'notes' ? ' active' : ''}`}
                  onClick={() => {
                    setCustomerReportsTab('notes');
                    loadSubAdminsData();
                    loadNoteThreads();
                    loadNoteMessages(selectedNoteCustomer || 'All');
                  }}
                >
                  <MessageSquare size={14} />
                  Notes & updates
                </button>
              </div>

            {customerReportsTab === 'notes' ? (
              <section className="sa-op-card sa-reg-dir-card">
                  <div className="sa-reg-dir-head">
                    <div className="sa-reg-dir-title">
                      <div className="sa-op-card-icon">
                        <MessageSquare size={16} />
                      </div>
                      <div>
                        <h2 className="sa-op-title">Customer Notes & Updates</h2>
                        <p className="sa-op-sub">
                          Chat-style notes — customers see these on mobile Dashboard → Updates.
                        </p>
                      </div>
                    </div>
                    <div className="sa-op-dir-tools">
                      <button
                        type="button"
                        className="sa-reg-btn-reset"
                        onClick={() => {
                          loadNoteThreads();
                          loadNoteMessages(selectedNoteCustomer || 'All');
                        }}
                        disabled={loadingNotes}
                      >
                        <RefreshCw size={14} />
                        {loadingNotes ? 'Refreshing…' : 'Refresh'}
                      </button>
                    </div>
                  </div>
                  {notesError && <div className="sa-op-banner error">{notesError}</div>}
                  <div className="sa-cr-split">
                    <div className="sa-cr-list">
                      <div className="sa-cr-list-head">
                        Customers
                        <select
                          value={selectedNoteCustomer || 'All'}
                          onChange={(e) => handleSelectNoteCustomer(e.target.value)}
                        >
                          <option value="All">All</option>
                          {(subAdmins || []).map((c) => (
                            <option key={c.id || c.email} value={String(c.email || '').toLowerCase()}>
                              {c.full_name || c.email} ({c.email})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {noteThreads.length === 0 ? (
                          <div className="sa-op-empty">No note threads yet.</div>
                        ) : (
                          noteThreads.map((t) => {
                            const email = String(t.customer_email || '').toLowerCase();
                            const active =
                              selectedNoteCustomer !== 'All' && email === selectedNoteCustomer;
                            return (
                              <button
                                key={email}
                                type="button"
                                className={`sa-cr-thread${active ? ' active' : ''}`}
                                onClick={() => handleSelectNoteCustomer(email)}
                              >
                                <strong>{t.customer_name || email}</strong>
                                <em>{email}</em>
                                <span>{t.last_message || '—'}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="sa-cr-pane">
                      <div className="sa-cr-pane-head">
                        {selectedNoteCustomer && selectedNoteCustomer !== 'All'
                          ? selectedNoteCustomer
                          : `All customers · send goes to everyone (${(subAdmins || []).length || 0})`}
                      </div>
                      <div className="sa-cr-messages">
                        {noteMessages.length === 0 ? (
                          <div className="sa-op-empty" style={{ margin: 'auto' }}>
                            {selectedNoteCustomer && selectedNoteCustomer !== 'All'
                              ? 'No notes yet. Send the first update.'
                              : 'No notes yet.'}
                          </div>
                        ) : (
                          noteMessages.map((m) => {
                            const fromAdmin = m.author_role === 'super_admin';
                            const showCustomer =
                              selectedNoteCustomer === 'All' || !selectedNoteCustomer;
                            return (
                              <div key={m.id} className={`sa-cr-bubble${fromAdmin ? ' out' : ''}`}>
                                <small>
                                  {showCustomer
                                    ? `${m.customer_name || m.customer_email || 'Customer'} · `
                                    : ''}
                                  {fromAdmin ? 'Super Admin' : (m.author_name || 'Customer')}
                                  {' · '}
                                  {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                                </small>
                                <p>{m.message}</p>
                                {fromAdmin ? (
                                  <button type="button" onClick={() => handleDeleteCustomerNote(m.id)}>
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                        <div ref={notesChatEndRef} />
                      </div>
                      <div className="sa-cr-compose">
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder={
                            selectedNoteCustomer && selectedNoteCustomer !== 'All'
                              ? 'Write an update / note for this customer…'
                              : 'Write a note — will send to ALL customers…'
                          }
                          disabled={sendingNote}
                          rows={2}
                        />
                        <button
                          type="button"
                          className="sa-op-btn-primary"
                          onClick={handleSendCustomerNote}
                          disabled={sendingNote || !String(noteDraft || '').trim()}
                        >
                          {sendingNote
                            ? 'Sending…'
                            : selectedNoteCustomer && selectedNoteCustomer !== 'All'
                              ? 'Send'
                              : 'Send to all'}
                        </button>
                      </div>
                    </div>
                  </div>
              </section>
            ) : (
              <section className="sa-op-card sa-op-directory sa-reg-dir-card">
                  <div className="sa-reg-dir-head">
                    <div className="sa-reg-dir-title">
                      <div className="sa-op-card-icon">
                        <MessageSquareWarning size={16} />
                      </div>
                      <div>
                        <h2 className="sa-op-title">Issue Reports Directory</h2>
                        <p className="sa-op-sub">
                          {customerReports.length} issue{customerReports.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="sa-op-dir-tools">
                      <label className="sa-op-search sa-reg-search">
                        <Search size={15} />
                        <input
                          type="search"
                          placeholder="Search by name, email, Ref No., issue..."
                          value={customerReportSearch}
                          onChange={(e) => setCustomerReportSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') loadCustomerReportsData();
                          }}
                        />
                      </label>
                      <select
                        className="sa-op-filter sa-cr-reg-filter"
                        value={customerReportStatusFilter}
                        onChange={(e) => setCustomerReportStatusFilter(e.target.value)}
                      >
                        <option value="All">All status</option>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                      </select>
                      <button
                        type="button"
                        className="sa-op-btn-primary"
                        onClick={loadCustomerReportsData}
                        disabled={loadingCustomerReports}
                      >
                        {loadingCustomerReports ? (
                          <>
                            <Loader2 size={14} className="spinner-icon" />
                            Apply
                          </>
                        ) : 'Apply'}
                      </button>
                    </div>
                  </div>

                  {customerReportsError && <div className="sa-op-banner error">{customerReportsError}</div>}

                  {loadingCustomerReports ? (
                    <SaDataLoading label="Loading customer reports…" />
                  ) : customerReports.length === 0 ? (
                    <div className="sa-op-empty">
                      <MessageSquareWarning size={28} />
                      <p>No customer reports found.</p>
                    </div>
                  ) : (
                    <div className="sa-cr-issue-list">
                      <div className="sa-cr-issue-list-head" aria-hidden="true">
                        <span>Customer</span>
                        <span>Ref No.</span>
                        <span>Issue message</span>
                        <span>Status</span>
                        <span>Submitted</span>
                        <span>Actions</span>
                      </div>
                      {customerReports.map((report, idx) => {
                        if (!report) return null;
                        const initials = String(report.customer_name || report.customer_email || 'CU')
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join('') || 'CU';
                        const avatarPalette = [
                          { bg: '#dbeafe', color: '#1d4ed8' },
                          { bg: '#ede9fe', color: '#6d28d9' },
                          { bg: '#ccfbf1', color: '#0f766e' },
                          { bg: '#ffedd5', color: '#c2410c' }
                        ];
                        const tone = avatarPalette[(Number(report.id) || idx) % avatarPalette.length];
                        const statusKey =
                          report.status === 'In Progress' ? 'progress'
                            : String(report.status || 'closed').toLowerCase();
                        const submitted = report.created_at
                          ? new Date(report.created_at).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '—';
                        return (
                          <article key={report.id} className="sa-cr-issue-item">
                            <div className="sa-cr-issue-col sa-cr-issue-col-customer">
                              <span
                                className="sa-op-avatar sa-reg-avatar"
                                style={{ background: tone.bg, color: tone.color }}
                              >
                                {initials}
                              </span>
                              <div className="sa-cr-issue-customer-text">
                                <strong>{report.customer_name || 'Unnamed customer'}</strong>
                                <em>{report.customer_email || '—'}</em>
                                {report.customer_phone ? (
                                  <span className="sa-cr-issue-phone">{report.customer_phone}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="sa-cr-issue-col sa-cr-issue-col-ref">
                              <span className="sa-cr-issue-ref-label">Ref No.</span>
                              <span className="sa-cr-issue-ref-value">
                                {report.reference_no || 'Query'}
                              </span>
                            </div>
                            <div className="sa-cr-issue-col sa-cr-issue-col-message">
                              <span className="sa-cr-issue-msg-label">Issue message</span>
                              <p className="sa-cr-issue-msg-body">
                                {String(report.message || '').trim() || '—'}
                              </p>
                              <div className="sa-cr-issue-scope">
                                <span title="Allowed clients">
                                  Clients: {report.allowed_clients || 'All'}
                                </span>
                                <span title="Allowed warehouses">
                                  Warehouses: {report.allowed_warehouses || 'All'}
                                </span>
                              </div>
                            </div>
                            <div className="sa-cr-issue-col sa-cr-issue-col-status">
                              <span className={`sa-cr-pill ${statusKey}`}>
                                {report.status || '—'}
                              </span>
                            </div>
                            <div className="sa-cr-issue-col sa-cr-issue-col-date">
                              <time dateTime={report.created_at || undefined}>{submitted}</time>
                            </div>
                            <div className="sa-cr-issue-col sa-cr-issue-col-actions">
                              <select
                                className="sa-cr-status-select"
                                value={report.status}
                                disabled={updatingReportId === report.id}
                                onChange={(e) => handleUpdateCustomerReportStatus(report.id, e.target.value)}
                                title="Update status"
                                aria-label="Update report status"
                              >
                                <option value="Open">Open</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Resolved">Resolved</option>
                                <option value="Closed">Closed</option>
                              </select>
                              <button
                                type="button"
                                className="sa-op-icon-btn danger"
                                title="Delete report"
                                disabled={updatingReportId === report.id}
                                onClick={() => handleDeleteCustomerReport(report.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
              </section>
            )}
            </div>
          </div>
        )}
          </>
        )}
      </main>



      {denyPermissionModal.open && (
        <div
          className="sa-profile-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sa-deny-permission-title"
          onClick={() => {
            if (!denyPermissionModal.busy) closeDenyPermissionModal();
          }}
        >
          <div className="sa-profile-confirm-content sa-deny-permission-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sa-profile-confirm-header">
              <h3 id="sa-deny-permission-title" className="sa-profile-confirm-title">
                <MessageSquareWarning size={20} color="#b91c1c" />
                <span>Deny permission</span>
              </h3>
            </div>
            <div className="sa-profile-confirm-body">
              <div className="sa-profile-confirm-box">
                <p className="sa-deny-permission-lead">
                  Add a remark so the DO knows why this request was denied.
                </p>
                {denyPermissionModal.operatorLabel ? (
                  <div className="sa-deny-permission-meta">
                    <span>Operator</span>
                    <strong>{denyPermissionModal.operatorLabel}</strong>
                  </div>
                ) : null}
                {denyPermissionModal.summary ? (
                  <div className="sa-deny-permission-meta">
                    <span>Request</span>
                    <strong>{denyPermissionModal.summary}</strong>
                  </div>
                ) : null}
                <label className="sa-deny-permission-label" htmlFor="sa-deny-remark">
                  Admin remark <em>(required)</em>
                </label>
                <textarea
                  id="sa-deny-remark"
                  className="sa-deny-permission-textarea"
                  rows={4}
                  placeholder="Example: Photo is unclear — please capture again and resubmit."
                  value={denyPermissionModal.remark}
                  disabled={denyPermissionModal.busy}
                  onChange={(e) =>
                    setDenyPermissionModal((prev) => ({ ...prev, remark: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="sa-profile-confirm-actions">
              <button
                type="button"
                className="sa-profile-confirm-cancel"
                disabled={denyPermissionModal.busy}
                onClick={closeDenyPermissionModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sa-profile-confirm-save sa-deny-permission-submit"
                disabled={denyPermissionModal.busy || !String(denyPermissionModal.remark || '').trim()}
                onClick={confirmDenyPermission}
              >
                {denyPermissionModal.busy ? (
                  <>
                    <Loader2 size={16} className="spinner-icon" />
                    <span>Denying…</span>
                  </>
                ) : (
                  <span>Deny &amp; send remark</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {opMasterDonePopup && (
        <div
          className="sa-profile-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sa-master-done-title"
          onClick={() => setOpMasterDonePopup(null)}
        >
          <div className="sa-profile-confirm-content" onClick={(e) => e.stopPropagation()}>
            <div className="sa-profile-confirm-header">
              <h3 id="sa-master-done-title" className="sa-profile-confirm-title">
                <CheckCircle size={20} color="#10b981" />
                <span>Master Updated</span>
              </h3>
            </div>

            <div className="sa-profile-confirm-body">
              <div className="sa-profile-confirm-box">
                <h4>Chamber & Client Mappings</h4>
                <div className="sa-profile-confirm-flags">
                  <div className="sa-profile-confirm-flag">
                    <span>Operator</span>
                    <strong>{opMasterDonePopup.operatorName}</strong>
                  </div>
                  <div className="sa-profile-confirm-flag">
                    <span>Warehouse</span>
                    <strong>{opMasterDonePopup.warehouseName || '—'}</strong>
                  </div>
                </div>
                {(() => {
                  const changeRows = (opMasterDonePopup.changes || []).map((change) => (
                    typeof change === 'string' ? { kind: 'other', text: change } : change
                  ));
                  const typeChanges = changeRows.filter((c) => c.kind === 'type');
                  const clientChanges = changeRows.filter((c) => c.kind === 'client');
                  const removeChanges = changeRows.filter((c) => c.kind === 'remove');
                  const otherChanges = changeRows.filter((c) => !['type', 'client', 'remove'].includes(c.kind));
                  if (!changeRows.length) {
                    return <p className="sa-master-done-empty">No mapping changes were made in this edit.</p>;
                  }
                  return (
                    <div className="sa-master-done-groups">
                      {typeChanges.length > 0 && (
                        <div>
                          <h5>Chamber type updates</h5>
                          <ul className="sa-master-done-list">
                            {typeChanges.map((change, idx) => (
                              <li key={`type-${idx}`}>{change.text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {clientChanges.length > 0 && (
                        <div>
                          <h5>Clients added</h5>
                          <ul className="sa-master-done-list">
                            {clientChanges.map((change, idx) => (
                              <li key={`client-${idx}`}>{change.text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {removeChanges.length > 0 && (
                        <div>
                          <h5>Clients removed</h5>
                          <ul className="sa-master-done-list">
                            {removeChanges.map((change, idx) => (
                              <li key={`remove-${idx}`}>{change.text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {otherChanges.length > 0 && (
                        <ul className="sa-master-done-list">
                          {otherChanges.map((change, idx) => (
                            <li key={`other-${idx}`}>{change.text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}
                <div className="sa-profile-confirm-banner">
                  These mappings will appear on the operator&apos;s mobile app shortly. Ask the DO to keep the app open or tap Sync.
                </div>
              </div>
            </div>

            <div className="sa-profile-confirm-actions single">
              <button
                type="button"
                className="sa-profile-confirm-save"
                onClick={() => setOpMasterDonePopup(null)}
              >
                <span>OK</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Data Profile Modal */}
      {selectedDetailLog && (
        <div className="profile-modal-overlay" onClick={() => {
          setSelectedDetailLog(null);
          setRecordAllowHistory([]);
        }}>
          <TaskDetailsView
            log={selectedDetailLog}
            detailType={
              detailType ||
              (selectedDetailLog.inward_id
                ? 'inward'
                : selectedDetailLog.outward_id
                  ? 'outward'
                  : 'daily')
            }
            onClose={() => {
              setSelectedDetailLog(null);
              setRecordAllowHistory([]);
            }}
            onEdit={() =>
              startSaEditLog(
                detailType ||
                  (selectedDetailLog.inward_id
                    ? 'inward'
                    : selectedDetailLog.outward_id
                      ? 'outward'
                      : 'daily'),
                selectedDetailLog
              )
            }
            onDelete={() =>
              handleSaDeleteLog(
                detailType ||
                  (selectedDetailLog.inward_id
                    ? 'inward'
                    : selectedDetailLog.outward_id
                      ? 'outward'
                      : 'daily'),
                selectedDetailLog
              )
            }
            onZoom={(src) => setLightboxImg(src)}
            renderOperatorEmail={renderOperatorEmail}
          />
        </div>
      )}
      {/* Lightbox View Modal — Ctrl+scroll zooms image only (frame fixed) */}
      {lightboxImg && (
        <div
          className="sa-lightbox-overlay"
          onClick={() => {
            setLightboxImg(null);
            setLightboxZoom(1);
          }}
        >
          <div
            className="sa-lightbox-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sa-lightbox-header">
              <strong>
                Photo Preview
                <span className="sa-lightbox-hint">
                  {' '}· Ctrl + scroll to zoom
                  {lightboxZoom > 1 ? ` · drag to move · ${Math.round(lightboxZoom * 100)}%` : ''}
                </span>
              </strong>
              <div className="sa-lightbox-actions">
                <a
                  href={
                    lightboxImg && lightboxImg.includes('res.cloudinary.com')
                      ? lightboxImg.replace('/upload/', '/upload/fl_attachment/')
                      : lightboxImg
                  }
                  download={`Audit_Attachment_${new Date().getTime()}.png`}
                  title="Download Photo"
                  className="sa-lightbox-download"
                >
                  <Download size={15} />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  className="sa-lightbox-close"
                  onClick={() => {
                    setLightboxImg(null);
                    setLightboxZoom(1);
                  }}
                  title="Close"
                >
                  <X size={16} />
                  <span>Close</span>
                </button>
              </div>
            </div>
            <div
              ref={lightboxBodyRef}
              className={`sa-lightbox-body${lightboxZoom > 1 ? ' is-zoomed' : ''}${lightboxPanning ? ' is-panning' : ''}`}
              onPointerDown={onLightboxPointerDown}
              onPointerMove={onLightboxPointerMove}
              onPointerUp={onLightboxPointerUp}
              onPointerCancel={onLightboxPointerUp}
            >
              <img
                src={lightboxImg}
                alt="Enlarged audit attachment"
                style={
                  lightboxZoom > 1
                    ? {
                        maxWidth: 'none',
                        maxHeight: 'none',
                        width: `${Math.round(lightboxZoom * 100)}%`,
                        height: 'auto'
                      }
                    : undefined
                }
                draggable={false}
                title={lightboxZoom > 1 ? 'Drag to move · Ctrl + scroll to zoom' : 'Ctrl + scroll to zoom'}
              />
            </div>
          </div>
        </div>
      )}

      {pendingLogDelete
        ? createPortal(
            <div className="sa-log-undo-toast" role="status">
              <div className="sa-log-undo-head">
                <span className="sa-log-undo-icon" aria-hidden>
                  <Undo2 size={13} />
                </span>
                <div className="sa-log-undo-text">
                  <strong>{pendingLogDelete.kindLabel}</strong> · <em>{pendingLogDelete.ref}</em> removed.
                  <span className="sa-log-undo-timer">{pendingLogDelete.secondsLeft}s left</span>
                </div>
              </div>
              <div className="sa-log-undo-actions">
                <button type="button" className="sa-log-undo-btn" onClick={handleUndoLogDelete}>
                  <Undo2 size={13} />
                  Undo
                </button>
                <button
                  type="button"
                  className="sa-log-undo-close"
                  onClick={finalizePendingLogDelete}
                  title="Dismiss — keep deleted"
                  aria-label="Close undo"
                >
                  <X size={13} />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {pendingOperatorDelete
        ? createPortal(
            <div className="sa-log-undo-toast" role="status">
              <div className="sa-log-undo-head">
                <span className="sa-log-undo-icon" aria-hidden>
                  <Undo2 size={13} />
                </span>
                <div className="sa-log-undo-text">
                  <strong>Operator</strong> · <em>{pendingOperatorDelete.label}</em> revoked.
                  <span className="sa-log-undo-timer">{pendingOperatorDelete.secondsLeft}s left</span>
                </div>
              </div>
              <div className="sa-log-undo-actions">
                <button type="button" className="sa-log-undo-btn" onClick={handleUndoOperatorDelete}>
                  <Undo2 size={13} />
                  Undo
                </button>
                <button
                  type="button"
                  className="sa-log-undo-close"
                  onClick={finalizePendingOperatorDelete}
                  title="Dismiss — keep revoked"
                  aria-label="Close undo"
                >
                  <X size={13} />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {pendingCustomerDelete
        ? createPortal(
            <div className="sa-log-undo-toast" role="status">
              <div className="sa-log-undo-head">
                <span className="sa-log-undo-icon" aria-hidden>
                  <Undo2 size={13} />
                </span>
                <div className="sa-log-undo-text">
                  <strong>Customer</strong> · <em>{pendingCustomerDelete.label}</em> revoked.
                  <span className="sa-log-undo-timer">{pendingCustomerDelete.secondsLeft}s left</span>
                </div>
              </div>
              <div className="sa-log-undo-actions">
                <button type="button" className="sa-log-undo-btn" onClick={handleUndoCustomerDelete}>
                  <Undo2 size={13} />
                  Undo
                </button>
                <button
                  type="button"
                  className="sa-log-undo-close"
                  onClick={finalizePendingCustomerDelete}
                  title="Dismiss — keep revoked"
                  aria-label="Close undo"
                >
                  <X size={13} />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {pendingMasterDelete
        ? createPortal(
            <div className="sa-log-undo-toast" role="status">
              <div className="sa-log-undo-head">
                <span className="sa-log-undo-icon" aria-hidden>
                  <Undo2 size={13} />
                </span>
                <div className="sa-log-undo-text">
                  {pendingMasterDelete.kind === 'chamber' ? (
                    <>
                      <strong>Chamber</strong> · <em>{pendingMasterDelete.label}</em> deleted.
                    </>
                  ) : (
                    <>
                      <strong>Client</strong> · <em>{pendingMasterDelete.label}</em> removed
                      {pendingMasterDelete.chamberName ? (
                        <>
                          {' '}
                          from <em>{pendingMasterDelete.chamberName}</em>
                        </>
                      ) : null}
                      .
                    </>
                  )}
                  <span className="sa-log-undo-timer">{pendingMasterDelete.secondsLeft}s left</span>
                </div>
              </div>
              <div className="sa-log-undo-actions">
                <button type="button" className="sa-log-undo-btn" onClick={handleUndoMasterDelete}>
                  <Undo2 size={13} />
                  Undo
                </button>
                <button
                  type="button"
                  className="sa-log-undo-close"
                  onClick={finalizePendingMasterDelete}
                  title="Dismiss — keep deleted"
                  aria-label="Close undo"
                >
                  <X size={13} />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
