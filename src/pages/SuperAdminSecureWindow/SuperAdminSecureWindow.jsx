// ====================================================================
// Super Admin Secure Window Component (src/pages/SuperAdminSecureWindow/SuperAdminSecureWindow.jsx)
// Paired with: src/pages/SuperAdminSecureWindow/SuperAdminSecureWindow.css
// Strictly accessible by role: 'super_admin' only.
// ====================================================================

import React, { useState, useEffect, useMemo, Suspense, lazy, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldCheck, Clock, LogOut, Database, Lock, Calendar,
  Thermometer, Trash2, Edit, UserPlus, ShieldAlert,
  Menu, X, ChevronRight, User, Eye, EyeOff, Activity, Search, Download, History, LayoutDashboard,
  Copy, Check, Loader2, CheckCircle, ClipboardCheck, MessageSquareWarning, MessageSquare, Smartphone, Package, Users, LayoutGrid,
  ChevronDown, ChevronUp, Plus, ArrowLeft, Undo2
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
  fetchInventoryReconciliation, fetchInventoryFilterOptions, fetchDailyInventoryDeltas,
  fetchClientMonthBoxSheet,
  fetchAppSubAdmins, createAppSubAdmin, deleteAppSubAdmin,
  fetchChamberAssignments, addChamberAssignment, deleteChamberAssignment,
  fetchChambers, createChamber, updateChamber, deleteChamber,
  fetchMasterWarehouses, fetchMasterClients
} from '../../services/api';
import MasterDataPanel from '../../components/MasterDataPanel/MasterDataPanel';
import { formatMasterLabel, lookupMasterLabel } from '../../utils/masterLabels';
import {
  requireExportDates,
  confirmExportSize,
  downloadCsv,
  toCsvContent,
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
import {
  computeDoTaskStatus,
  getActiveOperatorAssignments,
  getDefaultOpTaskRange,
  getOperatorDisplayChambers,
  assignmentMatchesDisplayChamber,
  chamberNumberFromName as strictChamberNumberFromName,
  localDateStr
} from '../../utils/doTaskStatus';
import '../../components/DOSidebar/DOSidebar.css';
import './SuperAdminSecureWindow.css';

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

const isDeactiveAssignment = (row) =>
  String(row?.status || 'active').trim().toLowerCase() === 'inactive';

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

export default function SuperAdminSecureWindow({ user, onLogout, onUserUpdate }) {
  const [time, setTime] = useState(new Date());
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
  const [opTaskAppliedFrom, setOpTaskAppliedFrom] = useState('');
  const [opTaskAppliedTo, setOpTaskAppliedTo] = useState('');
  const [opTaskLogs, setOpTaskLogs] = useState([]);
  const [opTaskLogsLoading, setOpTaskLogsLoading] = useState(false);
  const [opTaskLogsError, setOpTaskLogsError] = useState('');
  const [opTaskFilter, setOpTaskFilter] = useState('all');
  const [opTaskChamberFilter, setOpTaskChamberFilter] = useState('all');
  const [opEmail, setOpEmail] = useState('');
  const [opPassword, setOpPassword] = useState('');
  const [opFullName, setOpFullName] = useState('');
  const [opPhoneNo, setOpPhoneNo] = useState('');
  const [opWarehouseName, setOpWarehouseName] = useState('');
  const [opChamberLimit, setOpChamberLimit] = useState(4);
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
  /** DO profile sections: task_status | mappings | master_activity */
  const [opProfileSection, setOpProfileSection] = useState('task_status');
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
  const [lightboxImg, setLightboxImg] = useState(null);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);

  useEffect(() => {
    setLightboxZoomed(false);
  }, [lightboxImg]);
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
   * Parses "Field: old ➔ new, Field2: old2 ➔ new2" into readable rows.
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
        const arrowMatch = part.match(/^(.*?):\s*(.*?)\s*(?:➔|→|->)\s*(.*)$/);
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
                  color: tempVal != null && Number(tempVal) <= -18 ? '#15803d' : '#b91c1c'
                }}
              >
                {tempVal != null ? `${tempVal}°C` : '-'}
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
            {formField('Chamber Type', log.chamber_type || 'Frozen')}
            {formField('Inspection Time', log.inspection_time || '-')}
            {formField('Shift', shiftLabel)}
            {formField(
              'Box Temp (°C)',
              tempVal != null ? `${tempVal}°C` : '-',
              {
                valueStyle: {
                  fontWeight: 700,
                  color: tempVal != null && Number(tempVal) <= -18 ? '#15803d' : '#b91c1c'
                }
              }
            )}
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
  const [doTaskDate, setDoTaskDate] = useState(() => localDateStr());



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

  // Daily Box Tracker — live warehouse → client cascading filters (from DB)
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
    try {
      const data = await fetchClientMonthBoxSheet({
        client: row.client_name,
        warehouse: row.warehouse_name || undefined,
        chamber: row.chamber_name && row.chamber_name !== '-' ? row.chamber_name : undefined,
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

  const closeClientMonthSheet = () => {
    setDeltasViewClient(null);
    setClientMonthSheet(null);
    setMonthSheetError('');
    setLoadingMonthSheet(false);
    setMonthSheetFromDate('');
    setMonthSheetToDate('');
    setMonthSheetPage(1);
  };

  const loadDailyBoxTrackerData = async (warehouseOverride) => {
    const warehouse = warehouseOverride !== undefined ? warehouseOverride : deltasWarehouseFilter;
    setLoadingDeltas(true);
    setDeltasError('');
    try {
      const [filterData, deltaRows] = await Promise.all([
        fetchInventoryFilterOptions(),
        fetchDailyInventoryDeltas({
          warehouse: warehouse && warehouse !== 'All' ? warehouse : undefined
        })
      ]);
      setInventoryFilterOptions({
        warehouses: Array.isArray(filterData?.warehouses) ? filterData.warehouses : [],
        total_warehouses: Number(filterData?.total_warehouses) || 0,
        total_clients: Number(filterData?.total_clients) || 0
      });
      setDailyDeltas(Array.isArray(deltaRows) ? deltaRows : []);
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
    } catch (err) {
      setOpTaskLogs([]);
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

  const loadDoTaskOverview = async (dateOverride) => {
    setLoadingDoTasks(true);
    setDoTaskError('');
    try {
      const date =
        toApiDateParam(dateOverride !== undefined ? dateOverride : doTaskDate) ||
        localDateStr();
      const data = await fetchDoTaskOverview({ date });
      // Guard: older servers ignore ?date= and always return "today"
      if (data?.today && data.today !== date) {
        setDoTaskError(
          `Server returned ${data.today} instead of ${date}. Restart backend to enable date filter.`
        );
      }
      const operators = Array.isArray(data?.operators)
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
        today_outward: Number(data?.summary?.today_outward) || 0
      };
      setDoTaskOverview(data ? { ...data, summary, operators } : null);
      if (data?.today) setDoTaskDate(data.today);
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
        const chambers = `1 to ${op.chamber_limit || 4}`;
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
        "Inward Log ID", "Reference No", "Date", "Warehouse Code", "Warehouse Name", "Operator Email", "Vehicle No", "Seal No", 
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
        "Outward Log ID", "Reference No", "Date", "Warehouse Code", "Warehouse Name", "Operator Email", "Vehicle No", "Seal No", 
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
    setOpWarehouseName(op.warehouse_code || op.warehouse_name || '');
    setOpChamberLimit(op.chamber_limit || 4);
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
    setOpProfileSection('task_status');
    setExpandedOpMappingsId(null);
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setOpMasterActivitiesError('');
    setOpMasterActivityFilter('all');
    setOpMasterActivityPage(1);
    setOpMasterEditMode(false);
    setOpMasterSessionChanges([]);
    setOpMasterDonePopup(null);
    setNewClientInputs({});
    setNewChamberTypes({});
    setOpNewChamberName('');
    setOpNewChamberType('Frozen');
    setOpMasterActivities([]);
    setOpMasterActivitiesError('');
    const { fromDate, toDate } = getDefaultOpTaskRange(1); // task status: today
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
    setOpTaskLogs([]);
    setOpTaskLogsError('');

    const loadIoCounts = (async () => {
      try {
        const counts = await fetchDoOperatorIoCounts(op.email);
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
    setOpProfileSection('task_status');
    setOpMappings([]);
    setOpMappingsError('');
    setOpMappingsSuccess('');
    setOpMasterActivities([]);
    setOpMasterActivitiesError('');
    setOpMasterActivityFilter('all');
    setOpMasterActivityPage(1);
    setOpMasterEditMode(false);
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
    setOpTaskFilter('all');
    setOpTaskChamberFilter('all');
  };

  const cancelEditOperator = () => {
    setEditingOp(null);
    setOpEmail('');
    setOpFullName('');
    setOpPhoneNo('');
    setOpWarehouseName('');
    setOpChamberLimit(4);
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
      setSubAdmins(data || []);
    } catch (err) {
      setSubAdminError(err.message || 'Failed to fetch customers.');
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
      const value = w.warehouse_code || w.warehouse_name;
      if (!value) return;
      seen.add(String(w.warehouse_code || '').toLowerCase());
      seen.add(String(w.warehouse_name || '').toLowerCase());
      out.push({ value, label: formatMasterLabel(w.warehouse_code, w.warehouse_name) });
    });
    (accessScopeOptions.warehouses || []).forEach((name) => {
      const key = String(name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ value: name, label: name });
    });
    return out;
  }, [accessScopeOptions.warehouseMasters, accessScopeOptions.warehouses]);

  // Clients shown in Customer form = only those linked to selected warehouses
  const subAdminClientOptions = useMemo(() => {
    if (!subAdminSelectedWarehouses.length) return [];
    const selectedKeys = subAdminSelectedWarehouses.map((w) => String(w).trim().toLowerCase());
    const seen = new Set();
    const out = [];

    (accessScopeOptions.clientMasters || []).forEach((c) => {
      const whCode = String(c.warehouse_code || '').trim().toLowerCase();
      const whName = String(c.warehouse_name || '').trim().toLowerCase();
      if (selectedKeys.includes(whCode) || selectedKeys.includes(whName)) {
        const value = c.client_code || c.client_name;
        const key = String(value || '').trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        seen.add(String(c.client_name || '').trim().toLowerCase());
        out.push({ value, label: formatMasterLabel(c.client_code, c.client_name) });
      }
    });

    const map = accessScopeOptions.warehouseClients || {};
    Object.entries(map).forEach(([wh, clients]) => {
      const key = String(wh).trim().toLowerCase();
      if (!selectedKeys.includes(key)) return;
      (clients || []).forEach((c) => {
        const name = String(c || '').trim();
        const k = name.toLowerCase();
        if (!name || seen.has(k)) return;
        seen.add(k);
        out.push({ value: name, label: name });
      });
    });

    return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [accessScopeOptions.warehouseClients, accessScopeOptions.clientMasters, subAdminSelectedWarehouses]);

  // Drop selected clients that no longer belong to selected warehouses
  useEffect(() => {
    if (!subAdminSelectedWarehouses.length) {
      setSubAdminSelectedClients((prev) => (prev.length ? [] : prev));
      return;
    }
    if (!subAdminClientOptions.length) return;
    setSubAdminSelectedClients((prev) => {
      const allowed = new Set(subAdminClientOptions.map((c) => String(c.value || c).trim().toLowerCase()));
      const next = prev.filter((c) => allowed.has(String(c).trim().toLowerCase()));
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [subAdminSelectedWarehouses, subAdminClientOptions]);

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

  const startEditSubAdmin = (sa) => {
    setEditingSubAdmin(sa);
    setSubAdminEmail(sa.email);
    setSubAdminFullName(sa.full_name || '');
    setSubAdminPhoneNo(toLocalTenDigitPhone(sa.phone_no));
    setSubAdminPassword('');
    setSubAdminSelectedClients(sa.allowed_clients ? sa.allowed_clients.split(',').map(c => c.trim()).filter(Boolean) : []);
    setSubAdminSelectedWarehouses(sa.allowed_warehouses ? sa.allowed_warehouses.split(',').map(w => w.trim()).filter(Boolean) : []);
    setSubAdminError('');
    setSubAdminSuccess('');
  };

  const cancelEditSubAdmin = () => {
    setEditingSubAdmin(null);
    setSubAdminEmail('');
    setSubAdminFullName('');
    setSubAdminPhoneNo('');
    setSubAdminPassword('');
    setSubAdminSelectedClients([]);
    setSubAdminSelectedWarehouses([]);
    setShowPassword(false);
    setSubAdminError('');
    setSubAdminSuccess('');
    setSubAdminSearch('');
  };

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
      (activeMenu === 'daily_box_tracker' && (loadingInventory || loadingDeltas || loadingMonthSheet)) ||
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
        {activeMenu === 'super_admin_profile' && (
          <div className="sa-profile-window">
            <div className="sa-profile-window-top">
              <div className="sa-profile-window-title">
                <div className="sa-profile-window-icon">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2>Super Admin Profile</h2>
                  <p>Update login email and password from this working window.</p>
                </div>
              </div>
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

            <div className="sa-profile-window-grid">
              <div className="sa-profile-info-card">
                <h3>Account Details</h3>
                <div className="sa-profile-info-row">
                  <span>Role</span>
                  <strong>Super Admin</strong>
                </div>
                <div className="sa-profile-info-row">
                  <span>Email</span>
                  <strong>{user?.email || '—'}</strong>
                </div>
                <div className="sa-profile-info-row">
                  <span>Name</span>
                  <strong>{user?.full_name || 'Super Administrator'}</strong>
                </div>
                <div className="sa-profile-info-note">
                  Verify with your ID and password first. After verification you can update email, password, or both.
                </div>
              </div>

              <div className="sa-profile-security-card">
                {!profileAccessVerified ? (
                  <>
                    <h3>Profile Access Verification</h3>
                    <p className="sa-profile-security-sub">
                      Enter your Super Admin ID and password to continue.
                    </p>
                    <form className="sa-profile-form" onSubmit={handleProfileAccessVerify} autoComplete="off">
                      <label>Super Admin ID</label>
                      <div className="sa-profile-input-wrap">
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
                      <div className="sa-profile-input-wrap">
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
                            <Lock size={16} />
                            Verify and Continue
                          </>
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <h3>Update Email / Password</h3>
                    <p className="sa-profile-security-sub">
                      Update email, password, or both. Leave password fields blank if you only want to change email.
                    </p>
                    <form className="sa-profile-form" onSubmit={handleProfilePasswordSubmit} autoComplete="off">
                      <div className="sa-profile-old-email">
                        <h2>Old Email ID</h2>
                        <h1>{oldProfileEmail || user?.email || '-'}</h1>
                      </div>
                      <label>New Email ID</label>
                      <div className="sa-profile-input-wrap">
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
                      <div className="sa-profile-input-wrap">
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
                      <div className="sa-profile-input-wrap">
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
              <div className="sa-profile-subadmin-head">
                <div>
                  <h3>Register Mobile Sub-Admin</h3>
                  <p>
                    Sub-Admins get full mobile app access (view and process all data). Separate from Customers.
                  </p>
                </div>
                <Smartphone size={22} color="#00a2e8" />
              </div>

              <form className="sa-profile-form" onSubmit={handleCreateAppSubAdmin} autoComplete="off">
                <div className="sa-profile-subadmin-grid">
                  <div>
                    <label>Name *</label>
                    <div className="sa-profile-input-wrap">
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
                    <div className="sa-profile-input-wrap">
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
                    <div className="sa-profile-input-wrap">
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
                    <div className="sa-profile-input-wrap">
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

              <div className="sa-profile-subadmin-list">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <h4 style={{ margin: 0 }}>Registered Sub-Admins</h4>
                  <button
                    type="button"
                    className="sa-profile-window-back"
                    onClick={loadAppSubAdminsList}
                    disabled={appSubAdminLoading}
                    title="Refresh list"
                  >
                    {appSubAdminLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
                {appSubAdminErr && <div className="sa-profile-error">{appSubAdminErr}</div>}
                {appSubAdminLoading ? (
                  <p className="sa-profile-security-sub">Loading…</p>
                ) : appSubAdmins.length === 0 && !appSubAdminErr ? (
                  <p className="sa-profile-security-sub">No Sub-Admins yet.</p>
                ) : appSubAdmins.length === 0 ? null : (
                  <div className="table-responsive">
                    <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '10px 12px' }}>Name</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px' }}>Number</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px' }}>Email</th>
                          <th style={{ textAlign: 'center', padding: '10px 12px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appSubAdmins.map((row) => (
                          <tr key={row.id}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.full_name || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{row.phone_no || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{row.email}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteAppSubAdmin(row.id)}
                                style={{
                                  border: 'none',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  borderRadius: 8,
                                  padding: '6px 10px',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  fontSize: '0.75rem'
                                }}
                              >
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

        {activeMenu === 'dashboard' && (
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
                  onClick={() => setActiveMenu('data_operators')}
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

            <section className="sa-op-card sa-dash-tasks">
              <div className="sa-dash-task-head">
                <div className="sa-dash-task-head-left">
                  <span className="sa-dash-task-icon">
                    <ClipboardCheck size={15} />
                  </span>
                  <div className="sa-dash-task-titles">
                    <strong>DO tasks</strong>
                    <span>
                      {doTaskOverview?.today
                        ? new Date(`${doTaskOverview.today}T12:00:00`).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })
                        : doTaskDate === localDateStr()
                          ? 'Today'
                          : doTaskDate}
                      {' · Morning + Evening'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="sa-op-btn-text"
                  onClick={() => loadDoTaskOverview(doTaskDate)}
                  disabled={loadingDoTasks}
                >
                  {loadingDoTasks ? <Loader2 size={12} className="sa-spin" /> : null}
                  {loadingDoTasks ? 'Loading' : 'Refresh'}
                </button>
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
                <div className="sa-dash-task-metric inward-today" title={`Inward on ${doTaskOverview?.today || doTaskDate || 'selected day'} (all DOs)`}>
                  <span>{doTaskDate === localDateStr() ? 'Today Inward' : 'Day Inward'}</span>
                  <strong>{Number(doTaskSummary.today_inward) || 0}</strong>
                </div>
                <div className="sa-dash-task-metric outward-today" title={`Outward on ${doTaskOverview?.today || doTaskDate || 'selected day'} (all DOs)`}>
                  <span>{doTaskDate === localDateStr() ? 'Today Outward' : 'Day Outward'}</span>
                  <strong>{Number(doTaskSummary.today_outward) || 0}</strong>
                </div>
              </div>

              <div className="sa-dash-task-tools">
                <label className="sa-dash-task-date-wrap" title="Filter by date">
                  <Calendar size={13} />
                  <input
                    className="sa-op-filter sa-dash-task-date"
                    type="date"
                    value={doTaskDate}
                    max={localDateStr()}
                    onChange={(e) => {
                      const val = e.target.value || localDateStr();
                      setDoTaskDate(val);
                      loadDoTaskOverview(val);
                    }}
                    aria-label="DO tasks date"
                  />
                </label>
                {doTaskDate !== localDateStr() ? (
                  <button
                    type="button"
                    className="sa-dash-task-today-btn"
                    onClick={() => {
                      const today = localDateStr();
                      setDoTaskDate(today);
                      loadDoTaskOverview(today);
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

              {doTaskError ? (
                <div className="sa-op-banner-wrap">
                  <LoadErrorBanner
                    message={doTaskError}
                    onRetry={() => loadDoTaskOverview(doTaskDate)}
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
                      No submissions on this date. Choose another day to see completed Morning / Evening counts.
                    </div>
                  ) : null}
                  <div className="sa-dash-task-cols">
                    <span />
                    <span>Operator</span>
                    <span>Warehouse</span>
                    <span>Morning</span>
                    <span>Evening</span>
                    <span>Over</span>
                    <span title="Total · Today">In</span>
                    <span title="Total · Today">Out</span>
                  </div>
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
                    const inTotal = Number(op.total_inward) || 0;
                    const outTotal = Number(op.total_outward) || 0;
                    const inToday = Number(op.today_inward) || 0;
                    const outToday = Number(op.today_outward) || 0;
                    const tone =
                      overdue > 0
                        ? 'bad'
                        : mornPend > 0 || evePend > 0
                          ? 'warn'
                          : mornExp + eveExp > 0
                            ? 'good'
                            : 'muted';
                    return (
                      <button
                        key={`${op.id || op.email || op.name}-${idx}`}
                        type="button"
                        className={`sa-dash-task-row tone-${tone}`}
                        onClick={() => openDoFromDashboard(op)}
                        title={`${op.name || op.full_name || 'DO'} · Inward ${inTotal} (today ${inToday}) · Outward ${outTotal} (today ${outToday})`}
                      >
                        <span className="sa-dash-task-dot" />
                        <strong>{op.name || op.full_name || 'DO'}</strong>
                        <em>{op.warehouse_name || '—'}</em>
                        <span
                          className={`sa-dash-task-shift${mornPend > 0 ? ' pending' : mornExp > 0 ? ' done' : ''}`}
                        >
                          <span className="sa-dash-task-shift-top">
                            <b>{mornDone}</b>
                            <i>/{mornExp}</i>
                          </span>
                          <span className="sa-dash-task-bar" aria-hidden>
                            <span style={{ width: `${mornPct}%` }} />
                          </span>
                        </span>
                        <span
                          className={`sa-dash-task-shift${evePend > 0 ? ' pending' : eveExp > 0 ? ' done' : ''}`}
                        >
                          <span className="sa-dash-task-shift-top">
                            <b>{eveDone}</b>
                            <i>/{eveExp}</i>
                          </span>
                          <span className="sa-dash-task-bar" aria-hidden>
                            <span style={{ width: `${evePct}%` }} />
                          </span>
                        </span>
                        <b className={`overdue${overdue > 0 ? ' hot' : ''}`}>{overdue}</b>
                        <span className="sa-dash-task-io inward" title={`Inward total ${inTotal} · today ${inToday}`}>
                          <b>{inTotal}</b>
                          <i>·{inToday}</i>
                        </span>
                        <span className="sa-dash-task-io outward" title={`Outward total ${outTotal} · today ${outToday}`}>
                          <b>{outTotal}</b>
                          <i>·{outToday}</i>
                        </span>
                      </button>
                    );
                  })}
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
                  onClick={() => setActiveMenu('data_operators')}
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
          </div>
        )}







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
                                      ⚠️ {row.discrepancy > 0 ? `+${row.discrepancy} Excess` : `${row.discrepancy} Shortage`}
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

        {activeMenu === 'daily_box_tracker' && (() => {
          const liveWarehouses = inventoryFilterOptions.warehouses || [];
          const selectedWh = liveWarehouses.find(
            (w) => String(w.name).toLowerCase().trim() === String(deltasWarehouseFilter).toLowerCase().trim()
          );

          const clientsForWarehouse = deltasWarehouseFilter === 'All'
            ? Array.from(new Set(liveWarehouses.flatMap((w) => w.clients || []))).sort((a, b) => a.localeCompare(b))
            : (selectedWh?.clients || []);

          const filteredRows = (dailyDeltas || [])
            .filter((row) => {
              if (!row || !row.client_name) return false;
              if (deltasWarehouseFilter !== 'All') {
                const rowWh = String(row.warehouse_name || '').toLowerCase().trim();
                const selWh = String(deltasWarehouseFilter).toLowerCase().trim();
                if (rowWh !== selWh) return false;
              }
              if (deltasClientFilter !== 'All' && row.client_name !== deltasClientFilter) return false;
              return true;
            })
            .slice()
            .sort((a, b) => {
              // Latest update on top
              const da = String(a.latest_date || '');
              const db = String(b.latest_date || '');
              if (db !== da) return db.localeCompare(da);
              return String(a.client_name || '').localeCompare(String(b.client_name || ''));
            });

          const totalBoxes = filteredRows.reduce((sum, r) => sum + (Number(r.latest_count) || 0), 0);
          const netDelta = filteredRows.reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
          const uniqueClientsInData = new Set(filteredRows.map((r) => r.client_name)).size;

          // Client-wise box totals from live filtered rows (warehouse + client filters)
          const clientBoxMap = {};
          filteredRows.forEach((r) => {
            const name = r.client_name || 'Unknown';
            clientBoxMap[name] = (clientBoxMap[name] || 0) + (Number(r.latest_count) || 0);
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
              const start = angle;
              const end = angle + sweep;
              angle = end;
              const large = sweep > 180 ? 1 : 0;
              const p1 = polar(start, radius);
              const p2 = polar(end, radius);
              const p3 = polar(end, innerR);
              const p4 = polar(start, innerR);
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
                      boxes
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
            ? `Showing ${filteredRows.length} lots · ${uniqueClientsInData} clients · ${totalBoxes.toLocaleString()} boxes`
            : `${deltasWarehouseFilter}: ${filteredRows.length} lots · ${uniqueClientsInData} clients · ${totalBoxes.toLocaleString()} boxes`;

          const pageStart = (deltasCurrentPage - 1) * deltasPerPage;
          const paginatedRows = filteredRows.slice(pageStart, pageStart + deltasPerPage);

          const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const parts = String(dateStr).split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dateStr;
          };

          const handleExportBoxInventoryCSV = () => {
            if (!filteredRows.length) return;
            const headers = 'Client,Warehouse,Chamber,Previous Qty,Previous Temp,Previous Date,Latest Qty,Latest Temp,Latest Date,Plus/Minus,Status\n';
            const csvContent = headers + filteredRows.map((row) => {
              const latestQty = Math.max(0, Number(row.latest_count) || 0);
              const prevQty = Math.max(0, Number(row.prev_count) || 0);
              const inwardQty = Number(row.inward_qty) >= 0
                ? Number(row.inward_qty)
                : (latestQty > prevQty ? latestQty - prevQty : 0);
              const outwardQty = Number(row.outward_qty) >= 0
                ? Number(row.outward_qty)
                : (prevQty > latestQty ? prevQty - latestQty : 0);
              const status = inwardQty > 0 ? 'Plus' : outwardQty > 0 ? 'Minus' : 'No Change';
              const plusMinus = inwardQty > 0 ? `+${inwardQty}` : outwardQty > 0 ? `-${outwardQty}` : '0';
              const latestTemp = row.latest_temp != null && row.latest_temp !== '' ? `${row.latest_temp}°C` : '';
              const prevTemp = row.prev_temp != null && row.prev_temp !== '' ? `${row.prev_temp}°C` : '';
              return [
                `"${row.client_name || '-'}"`,
                `"${row.warehouse_name || '-'}"`,
                `"${row.chamber_name || '-'}"`,
                row.prev_date ? prevQty : '',
                prevTemp,
                `"${formatDate(row.prev_date)}"`,
                latestQty,
                latestTemp,
                `"${formatDate(row.latest_date)}"`,
                plusMinus,
                `"${status}"`
              ].join(',');
            }).join('\n');
            const whTag = deltasWarehouseFilter === 'All' ? 'All' : String(deltasWarehouseFilter).replace(/\s+/g, '_');
            downloadCsv(`Box_Inventory_${whTag}_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
          };

          return (
            <div className="sa-op-gmail sa-box-tracker">
              {deltasViewClient ? (() => {
                const row = deltasViewClient;
                const meta = clientMonthSheet?.meta || {};
                const days = Array.isArray(clientMonthSheet?.days) ? clientMonthSheet.days : [];
                const warehouseLabel = meta.warehouse_name || row.warehouse_name || '—';
                const chamberLabel = meta.chamber_name || row.chamber_name || '—';
                const supervisorLabel = meta.supervisor_name
                  ? meta.supervisor_email
                    ? `${meta.supervisor_name} (${meta.supervisor_email})`
                    : meta.supervisor_name
                  : '—';

                const handleExportMonthSheetCSV = () => {
                  if (!days.length) return;
                  const headers =
                    'Date,Warehouse,Chamber,Warehouse Supervisor,Morning Boxes,Evening Boxes,Inward Boxes,Outward Boxes,Total Boxes\n';
                  const csvContent = headers + days.map((d) => {
                    const fmtQty = (v) => (v == null || v === '' ? '' : Math.max(0, Number(v) || 0));
                    return [
                      `"${formatDate(d.date)}"`,
                      `"${String(warehouseLabel).replace(/"/g, '""')}"`,
                      `"${String(chamberLabel).replace(/"/g, '""')}"`,
                      `"${String(supervisorLabel).replace(/"/g, '""')}"`,
                      fmtQty(d.morning_qty),
                      fmtQty(d.evening_qty),
                      fmtQty(d.inward_boxes),
                      fmtQty(d.outward_boxes),
                      fmtQty(d.total_boxes)
                    ].join(',');
                  }).join('\n');
                  const safeName = String(row.client_name || 'Client').replace(/[^\w\-]+/g, '_');
                  downloadCsv(
                    `Box_Month_${safeName}_${meta.fromDate || 'from'}_${meta.toDate || 'to'}.csv`,
                    csvContent
                  );
                };

                const cellQty = (v) => {
                  if (v == null || v === '') return '—';
                  return Math.max(0, Number(v) || 0).toLocaleString();
                };

                const monthSheetStart = (monthSheetPage - 1) * monthSheetPerPage;
                const paginatedDays = days.slice(
                  monthSheetStart,
                  monthSheetStart + monthSheetPerPage
                );

                return (
                  <section className="sa-op-card sa-box-month-sheet">
                    <div className="sa-op-dir-toolbar">
                      <div className="sa-op-dir-tools">
                        <button
                          type="button"
                          className="sa-box-back-btn"
                          onClick={closeClientMonthSheet}
                        >
                          ← Back
                        </button>
                        <div>
                          <h2 className="sa-op-title">{row.client_name}</h2>
                          <p className="sa-op-sub">
                            1-month daily box sheet · Morning / Evening / Inward / Outward / Total
                            {meta.fromDate && meta.toDate
                              ? ` · ${formatDate(meta.fromDate)} → ${formatDate(meta.toDate)}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="sa-op-dir-tools">
                        <button
                          type="button"
                          className="sa-op-btn-primary"
                          onClick={() =>
                            openClientMonthSheet(row, {
                              fromDate: monthSheetFromDate,
                              toDate: monthSheetToDate
                            })
                          }
                          disabled={loadingMonthSheet}
                        >
                          {loadingMonthSheet ? <Loader2 size={14} className="spinner-icon" /> : <Activity size={14} />}
                          Refresh
                        </button>
                        <button
                          type="button"
                          className="sa-op-btn-export"
                          onClick={handleExportMonthSheetCSV}
                          disabled={!days.length || loadingMonthSheet}
                        >
                          <Download size={14} />
                          Export Excel CSV
                        </button>
                      </div>
                    </div>

                    <div className="sa-box-month-filters">
                      <label className="sa-op-field">
                        <span>From</span>
                        <input
                          className="sa-op-filter"
                          type="date"
                          value={monthSheetFromDate}
                          max={monthSheetToDate || localDateStr()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMonthSheetFromDate(val);
                            if (val && monthSheetToDate && val > monthSheetToDate) {
                              setMonthSheetToDate(val);
                            }
                          }}
                          title="From date"
                        />
                      </label>
                      <label className="sa-op-field">
                        <span>To</span>
                        <input
                          className="sa-op-filter"
                          type="date"
                          value={monthSheetToDate}
                          min={monthSheetFromDate || undefined}
                          max={localDateStr()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMonthSheetToDate(val);
                            if (val && monthSheetFromDate && val < monthSheetFromDate) {
                              setMonthSheetFromDate(val);
                            }
                          }}
                          title="To date"
                        />
                      </label>
                      <button
                        type="button"
                        className="sa-op-btn-primary"
                        disabled={loadingMonthSheet || !monthSheetFromDate || !monthSheetToDate}
                        onClick={() =>
                          openClientMonthSheet(row, {
                            fromDate: monthSheetFromDate,
                            toDate: monthSheetToDate
                          })
                        }
                      >
                        Apply Filter
                      </button>
                      {[
                        { days: 1, label: 'Today' },
                        { days: 7, label: '7 days' },
                        { days: 30, label: '30 days' }
                      ].map((preset) => {
                        const range = getDefaultOpTaskRange(preset.days);
                        const active =
                          monthSheetFromDate === range.fromDate && monthSheetToDate === range.toDate;
                        return (
                          <button
                            key={preset.days}
                            type="button"
                            className={`sa-op-btn-text${active ? ' sa-op-btn-text-active' : ''}`}
                            disabled={loadingMonthSheet}
                            onClick={() => openClientMonthSheet(row, { fromDate: range.fromDate, toDate: range.toDate })}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="sa-box-stat-grid sa-box-month-stats">
                      <div className="sa-box-stat-card">
                        <div className="sa-box-stat-label">Month Inward</div>
                        <div className="sa-box-stat-value" style={{ color: '#137333' }}>
                          +{(Number(meta.month_inward_total) || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="sa-box-stat-card">
                        <div className="sa-box-stat-label">Month Outward</div>
                        <div className="sa-box-stat-value" style={{ color: '#c5221f' }}>
                          −{(Number(meta.month_outward_total) || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="sa-box-stat-card">
                        <div className="sa-box-stat-label">Closing Total</div>
                        <div className="sa-box-stat-value primary">
                          {meta.closing_total == null
                            ? '—'
                            : Number(meta.closing_total).toLocaleString()}
                        </div>
                      </div>
                      <div className="sa-box-stat-card">
                        <div className="sa-box-stat-label">Days</div>
                        <div className="sa-box-stat-value">
                          {meta.day_count != null ? meta.day_count : days.length || '—'}
                        </div>
                      </div>
                    </div>

                    {monthSheetError && (
                      <LoadErrorBanner
                        message={monthSheetError}
                        onRetry={() =>
                          openClientMonthSheet(row, {
                            fromDate: monthSheetFromDate,
                            toDate: monthSheetToDate
                          })
                        }
                        onDismiss={() => setMonthSheetError('')}
                      />
                    )}

                    <div className="sa-box-detail-body">
                      <div className="sa-box-table-head" style={{ borderTop: '1px solid #e0e0e0' }}>
                        <h3 className="sa-op-title">Daily Sheet (Excel style)</h3>
                        <span className="sa-box-chart-sub">
                          {loadingMonthSheet ? 'Loading…' : `${days.length} days`}
                        </span>
                      </div>

                      {loadingMonthSheet && !days.length ? (
                        <div className="sa-box-empty">
                          <SaDataLoading label="Loading 1-month sheet…" compact />
                        </div>
                      ) : days.length === 0 ? (
                        <div className="sa-box-empty">No daily rows for this period.</div>
                      ) : (
                        <>
                          <div className="sa-box-table-wrap table-responsive sa-box-excel-wrap">
                            <table className="logs-table sa-box-excel-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Warehouse</th>
                                  <th>Chamber</th>
                                  <th>Warehouse Supervisor</th>
                                  <th className="sa-box-th-center">Morning</th>
                                  <th className="sa-box-th-center">Evening</th>
                                  <th className="sa-box-th-center">Inward</th>
                                  <th className="sa-box-th-center">Outward</th>
                                  <th className="sa-box-th-center">Total Boxes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedDays.map((d) => (
                                  <tr key={d.date}>
                                    <td className="sa-box-excel-date">{formatDate(d.date)}</td>
                                    <td className="sa-box-muted">{warehouseLabel}</td>
                                    <td className="sa-box-muted">{chamberLabel}</td>
                                    <td className="sa-box-muted">{supervisorLabel}</td>
                                    <td className="sa-box-td-center">{cellQty(d.morning_qty)}</td>
                                    <td className="sa-box-td-center">{cellQty(d.evening_qty)}</td>
                                    <td className={`sa-box-td-center ${Number(d.inward_boxes) > 0 ? 'sa-box-flow up' : ''}`}>
                                      {Number(d.inward_boxes) > 0
                                        ? `+${Number(d.inward_boxes).toLocaleString()}`
                                        : '0'}
                                    </td>
                                    <td className={`sa-box-td-center ${Number(d.outward_boxes) > 0 ? 'sa-box-flow down' : ''}`}>
                                      {Number(d.outward_boxes) > 0
                                        ? `−${Number(d.outward_boxes).toLocaleString()}`
                                        : '0'}
                                    </td>
                                    <td className="sa-box-td-center sa-box-qty-latest">
                                      {cellQty(d.total_boxes)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <PaginationBar
                            page={monthSheetPage}
                            totalItems={days.length}
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
                    <p className="sa-op-sub">Select a warehouse to view its box inventory below.</p>
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
                        setDeltasViewClient(null);
                        setClientMonthSheet(null);
                        setMonthSheetError('');
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
                      <span className={`sa-box-live-dot${loadingDeltas ? '' : ''}`} style={loadingDeltas ? { background: '#9aa0a6', boxShadow: 'none' } : undefined} />
                      Clients × Boxes
                    </h3>
                    <span className="sa-box-chart-sub">
                      {deltasWarehouseFilter === 'All' ? 'All Warehouses' : deltasWarehouseFilter}
                      {deltasClientFilter !== 'All' ? ` · ${deltasClientFilter}` : ''}
                      {' · '}
                      {loadingDeltas ? 'syncing…' : 'live DB'}
                    </span>
                  </div>
                  {renderClientBoxesPieSvg()}
                </div>
              </section>

              <section className="sa-op-card">
                <div className="sa-box-table-head">
                  <h3 className="sa-op-title">
                    {deltasWarehouseFilter === 'All' ? 'All Warehouses — Box Inventory' : `${deltasWarehouseFilter} — Box Inventory`}
                  </h3>
                  <div className="sa-box-table-meta">
                    <span>
                      Total boxes: <strong>{totalBoxes.toLocaleString()}</strong>
                    </span>
                    <span className={netDelta > 0 ? 'net-up' : netDelta < 0 ? 'net-down' : ''}>
                      {netDelta > 0
                        ? `Net inward: +${netDelta}`
                        : netDelta < 0
                          ? `Net outward: ${Math.abs(netDelta)}`
                          : 'Net: No change'}
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
                  <SaDataLoading label="Loading warehouse inventory…" />
                ) : filteredRows.length === 0 ? (
                  <div className="sa-box-empty">No box inventory data matches this filter.</div>
                ) : (
                  <>
                    <div className="sa-box-table-wrap table-responsive">
                      <table className="logs-table">
                        <thead>
                          <tr>
                            <th>Client</th>
                            <th>Warehouse</th>
                            <th>Chamber</th>
                            <th className="sa-box-th-center">Prev Qty</th>
                            <th className="sa-box-th-center">Latest Qty</th>
                            <th className="sa-box-th-center">Box Temp</th>
                            <th className="sa-box-th-center">Slot</th>
                            <th className="sa-box-th-center">In / Out</th>
                            <th className="sa-box-th-center">Latest Date</th>
                            <th className="sa-box-th-center">Status</th>
                            <th className="sa-box-th-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRows.map((row, idx) => {
                            const latestQty = Math.max(0, Number(row.latest_count) || 0);
                            const prevQty = Math.max(0, Number(row.prev_count) || 0);
                            const inwardQty = Number(row.inward_qty) >= 0
                              ? Number(row.inward_qty)
                              : (latestQty > prevQty ? latestQty - prevQty : 0);
                            const outwardQty = Number(row.outward_qty) >= 0
                              ? Number(row.outward_qty)
                              : (prevQty > latestQty ? prevQty - latestQty : 0);
                            const isUp = inwardQty > 0;
                            const isDown = outwardQty > 0;
                            // Only one at a time: Plus OR Minus
                            const flowLabel = isUp
                              ? `Plus: +${inwardQty}`
                              : isDown
                                ? `Minus: -${outwardQty}`
                                : '0';
                            const latestTempRaw = row.latest_temp ?? row.box_temp ?? row.chamber_temp;
                            const latestTemp = latestTempRaw != null && latestTempRaw !== '' && Number.isFinite(Number(latestTempRaw))
                              ? Number(latestTempRaw)
                              : null;
                            const slotLabel = resolveShiftLabel(row.latest_shift || row.latest_slot, null, null);
                            const isMorningSlot = slotLabel === 'Morning';

                            return (
                              <tr key={`${row.client_name}-${row.chamber_name}-${idx}`}>
                                <td className="sa-box-client-name">{row.client_name}</td>
                                <td className="sa-box-muted">{row.warehouse_name || '-'}</td>
                                <td className="sa-box-muted">{row.chamber_name || '-'}</td>
                                <td className="sa-box-td-center sa-box-muted">
                                  {row.prev_date ? prevQty.toLocaleString() : '-'}
                                </td>
                                <td className="sa-box-td-center sa-box-qty-latest">
                                  {latestQty.toLocaleString()}
                                </td>
                                <td className="sa-box-td-center" style={{
                                  fontWeight: 500,
                                  color: latestTemp == null ? '#5f6368' : latestTemp <= -18 ? '#137333' : '#c5221f'
                                }}>
                                  {latestTemp == null ? '—' : `${latestTemp}°C`}
                                </td>
                                <td className="sa-box-td-center">
                                  <span className={`sa-box-slot ${isMorningSlot ? 'morning' : 'evening'}`}>
                                    {slotLabel}
                                  </span>
                                </td>
                                <td className={`sa-box-td-center sa-box-flow ${isUp ? 'up' : isDown ? 'down' : 'neutral'}`}>
                                  {flowLabel}
                                </td>
                                <td className="sa-box-td-center sa-box-muted">
                                  {formatDate(row.latest_date)}
                                </td>
                                <td className="sa-box-td-center">
                                  <span className={`sa-box-status ${isUp ? 'inward' : isDown ? 'outward' : 'neutral'}`}>
                                    {isUp ? 'Inward' : isDown ? 'Outward' : 'No Change'}
                                  </span>
                                </td>
                                <td className="sa-box-td-center">
                                  <button
                                    type="button"
                                    className="sa-box-view-link"
                                    onClick={() => openClientMonthSheet(row)}
                                  >
                                    View
                                  </button>
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
                        itemLabel="lots"
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
                            alert("⚠️ Date Range Error:\n'From Date' must be less than or equal to 'To Date'.");
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
                        alert("⚠️ Date Range Error:\n'From Date' must be less than or equal to 'To Date'.");
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
                                ⚠️ Late ({log.overdue_time})
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
                            backgroundColor: log.chamber_temp <= -18 ? '#dcfce7' : '#fee2e2', 
                            color: log.chamber_temp <= -18 ? '#15803d' : '#b91c1c', 
                            fontWeight: 800 
                          }}>
                            {log.chamber_temp}°C
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

        {activeMenu === 'master_data' && <MasterDataPanel />}

        {activeMenu === 'customers' && (
          <div className="sa-um">
              <div className="sa-op-gmail">
                <section className="sa-op-card">
                  <div className="sa-op-card-head">
                    <div className="sa-op-card-icon">{editingSubAdmin ? <Edit size={14} /> : <UserPlus size={14} />}</div>
                    <div>
                      <h2 className="sa-op-title">{editingSubAdmin ? 'Modify Customer Profile' : 'Register New Customer'}</h2>
                      <p className="sa-op-sub">
                        {editingSubAdmin
                          ? editingSubAdmin.email
                          : 'All fields are required. Registered credentials grant dashboard and inquiry access.'}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveSubAdmin} className="sa-op-form">
                    <div className="sa-op-form-grid">
                      <label className="sa-op-field">
                        <span>Full Name</span>
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
                      </label>

                      <label className="sa-op-field">
                        <span>Phone No.</span>
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
                      </label>

                      <label className="sa-op-field sa-op-field-wide">
                        <span>Email ID</span>
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
                      </label>

                      <label className="sa-op-field">
                        <span>{editingSubAdmin ? 'Password (leave blank to keep)' : 'Password'}</span>
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
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Allowed Warehouses</span>
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
                        <div className="sa-op-chips">
                          {subAdminSelectedWarehouses.length === 0 ? (
                            <em>No warehouses selected — full warehouse access</em>
                          ) : (
                            subAdminSelectedWarehouses.map((wh, idx) => (
                              <span key={idx} className="sa-op-chip">
                                {lookupMasterLabel(wh, accessScopeOptions.warehouseMasters)}
                                <button type="button" onClick={() => setSubAdminSelectedWarehouses((prev) => prev.filter((_, i) => i !== idx))} title="Remove">
                                  <X size={12} />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Allowed Clients</span>
                        <select
                          value=""
                          disabled={subAdminSelectedWarehouses.length === 0}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val && !subAdminSelectedClients.includes(val)) {
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
                          {subAdminClientOptions
                            .filter((c) => !subAdminSelectedClients.includes(c.value))
                            .map((client) => (
                              <option key={client.value} value={client.value}>
                                {client.label}
                              </option>
                            ))}
                        </select>
                        <div className="sa-op-chips">
                          {subAdminSelectedWarehouses.length === 0 ? (
                            <em>Pick warehouses above — clients will list for those warehouses only</em>
                          ) : subAdminSelectedClients.length === 0 ? (
                            <em>No clients selected — all clients in selected warehouse(s)</em>
                          ) : (
                            subAdminSelectedClients.map((client, idx) => (
                              <span key={idx} className="sa-op-chip">
                                {lookupMasterLabel(client, accessScopeOptions.clientMasters)}
                                <button type="button" onClick={() => setSubAdminSelectedClients((prev) => prev.filter((_, i) => i !== idx))} title="Remove">
                                  <X size={12} />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </label>
                    </div>

                    <div className="sa-op-form-actions">
                      {editingSubAdmin && (
                        <button type="button" className="sa-op-btn-text" onClick={cancelEditSubAdmin}>
                          Cancel
                        </button>
                      )}
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
                        ) : (editingSubAdmin ? 'Update Customer' : 'Register Customer')}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="sa-op-card sa-op-directory">
                  {(() => {
                    const filteredSubAdminsList = subAdmins.filter((sa) => {
                      const term = subAdminSearch.toLowerCase();
                      return (
                        (sa.full_name && sa.full_name.toLowerCase().includes(term)) ||
                        (sa.email && sa.email.toLowerCase().includes(term)) ||
                        (sa.phone_no && sa.phone_no.toLowerCase().includes(term))
                      );
                    });
                    return (
                      <>
                        <div className="sa-op-dir-toolbar">
                          <div>
                            <h2 className="sa-op-title">Customers Directory</h2>
                            <p className="sa-op-sub">
                              {filteredSubAdminsList.length} customer{filteredSubAdminsList.length === 1 ? '' : 's'} · search, edit or revoke access
                            </p>
                          </div>
                          <div className="sa-op-dir-tools">
                            <label className="sa-op-search">
                              <Search size={14} />
                              <input
                                type="search"
                                placeholder="Search mail-style: name, email, phone"
                                value={subAdminSearch}
                                onChange={(e) => setSubAdminSearch(e.target.value)}
                              />
                            </label>
                          </div>
                        </div>

                        {subAdminSuccess && <div className="sa-op-banner success">{subAdminSuccess}</div>}
                        {subAdminError && <div className="sa-op-banner error">{subAdminError}</div>}

                        {loadingSubAdmins ? (
                          <SaDataLoading label="Loading customers…" />
                        ) : filteredSubAdminsList.length === 0 ? (
                          <div className="sa-op-empty">
                            <ShieldAlert size={28} />
                            <p>No matching customers found.</p>
                          </div>
                        ) : (
                          <div className="sa-op-inbox">
                            {filteredSubAdminsList.map((sa) => {
                              const initials = String(sa.full_name || sa.email || 'CU')
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((p) => p[0]?.toUpperCase())
                                .join('') || 'CU';
                              const warehouses = sa.allowed_warehouses
                                ? sa.allowed_warehouses.split(',').map((w) => w.trim()).filter(Boolean).join(', ')
                                : 'All warehouses';
                              const clients = sa.allowed_clients
                                ? sa.allowed_clients.split(',').map((c) => c.trim()).filter(Boolean).join(', ')
                                : 'All clients';
                              return (
                                <div key={sa.id} className="sa-op-inbox-row">
                                  <button
                                    type="button"
                                    className="sa-op-inbox-main"
                                    onClick={() => startEditSubAdmin(sa)}
                                    title="Edit Customer Profile"
                                  >
                                    <span className="sa-op-avatar">{initials}</span>
                                    <span className="sa-op-sender">
                                      <strong>{sa.full_name || 'Unnamed customer'}</strong>
                                      <em>Customer</em>
                                    </span>
                                    <span className="sa-op-snippet">
                                      {sa.email}
                                      {sa.phone_no ? ` · ${formatIndiaPhoneDisplay(sa.phone_no)}` : ''}
                                      {' · '}
                                      {warehouses}
                                      {' · '}
                                      {clients}
                                    </span>
                                    <span className="sa-op-date">
                                      {sa.created_at ? new Date(sa.created_at).toLocaleDateString('en-GB') : '—'}
                                    </span>
                                  </button>
                                  <div className="sa-op-row-actions">
                                    <button type="button" className="sa-op-icon-btn" onClick={() => startEditSubAdmin(sa)} title="Edit">
                                      <Edit size={14} />
                                    </button>
                                    <button type="button" className="sa-op-icon-btn danger" onClick={() => handleDeleteSubAdmin(sa)} title="Revoke">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </section>
              </div>
          </div>
        )}

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
                  { label: 'Chamber Limit', value: `Chambers 1 to ${op.chamber_limit || 4}` },
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
                return (
                  <div className="do-gmail-view">
                    <div className="do-gmail-panel">
                      <div className="do-gmail-toolbar">
                        <div className="do-gmail-toolbar-left">
                          <button type="button" className="do-gmail-icon-btn" onClick={closeOperatorProfile} title="Back">
                            <ArrowLeft size={14} />
                          </button>
                          <div className="do-gmail-avatar">{initials}</div>
                          <div>
                            <h2 className="do-gmail-title">{op.full_name || 'Data Operator'}</h2>
                            <p className="do-gmail-sub">{op.email}</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button type="button" className="do-gmail-text-btn" onClick={() => startEditOperator(op)}>
                            <Edit size={12} />
                            Edit
                          </button>
                          <button type="button" className="do-gmail-text-btn danger" onClick={() => handleDeleteOperator(op)}>
                            <Trash2 size={12} />
                            Revoke
                          </button>
                        </div>
                      </div>
                      <div className="do-gmail-section-label">Account</div>
                      {profileFields.map((field) => (
                        <div key={field.label} className="do-gmail-row">
                          <div className="do-gmail-row-label">{field.label}</div>
                          <div className="do-gmail-row-value">{field.value}</div>
                        </div>
                      ))}
                      <div className="do-gmail-section-label">Inward &amp; Outward (this DO)</div>
                      <div className="do-profile-io-metrics">
                        <div className="do-profile-io-card inward">
                          <span>Total Inward</span>
                          <strong>{ioLoading ? '…' : inTotal}</strong>
                          <em>All records by {op.email || 'this DO'}</em>
                        </div>
                        <div className="do-profile-io-card outward">
                          <span>Total Outward</span>
                          <strong>{ioLoading ? '…' : outTotal}</strong>
                          <em>All records by {op.email || 'this DO'}</em>
                        </div>
                        <div className="do-profile-io-card inward-today">
                          <span>Today Inward</span>
                          <strong>{ioLoading ? '…' : inToday}</strong>
                          <em>Entry date {op.io_counts_today || localDateStr()}</em>
                        </div>
                        <div className="do-profile-io-card outward-today">
                          <span>Today Outward</span>
                          <strong>{ioLoading ? '…' : outToday}</strong>
                          <em>Entry date {op.io_counts_today || localDateStr()}</em>
                        </div>
                      </div>
                      <div className="do-gmail-row">
                        <div className="do-gmail-row-label">Access</div>
                        <div className="do-gmail-row-value">
                          {op.warehouse_name
                            ? op.warehouse_name
                            : 'Not configured — edit profile'}
                        </div>
                      </div>
                    </div>

                    <div className="sa-gmail-tabs sa-gmail-tabs-wrap do-profile-section-tabs">
                      <button
                        type="button"
                        className={`sa-gmail-tab${opProfileSection === 'task_status' ? ' active' : ''}`}
                        onClick={() => setOpProfileSection('task_status')}
                      >
                        <Thermometer size={14} />
                        Chamber Task Status
                      </button>
                      <button
                        type="button"
                        className={`sa-gmail-tab${opProfileSection === 'mappings' ? ' active' : ''}`}
                        onClick={() => setOpProfileSection('mappings')}
                      >
                        <LayoutGrid size={14} />
                        Chamber &amp; Client Mappings
                      </button>
                      <button
                        type="button"
                        className={`sa-gmail-tab${opProfileSection === 'master_activity' ? ' active' : ''}`}
                        onClick={() => setOpProfileSection('master_activity')}
                      >
                        <Activity size={14} />
                        Master Setup Activity
                      </button>
                    </div>

                    {opProfileSection === 'task_status' && (
                    <div className="do-gmail-panel do-gmail-task-panel">
                      <div className="do-gmail-toolbar">
                        <div>
                          <h3 className="do-gmail-title">Chamber Task Status</h3>
                          <p className="do-gmail-sub">
                            Morning &amp; Evening inspections
                            {' · '}
                            {opTaskAppliedFrom && opTaskAppliedTo
                              ? (opTaskAppliedFrom === opTaskAppliedTo
                                ? opTaskAppliedFrom
                                : `${opTaskAppliedFrom} to ${opTaskAppliedTo}`)
                              : 'select dates'}
                            {' · '}
                            {opTaskStatus.assignmentCount} active client{opTaskStatus.assignmentCount === 1 ? '' : 's'}
                            {!opTaskLogsLoading && opActiveAssignments.length > 0
                              ? ` · ${opTaskLogs.length} log${opTaskLogs.length === 1 ? '' : 's'} loaded`
                              : ''}
                          </p>
                        </div>
                        <div className="do-map-edit-actions">
                          <span className={`do-gmail-status-pill ${opTaskStatus.statusTone}`}>
                            {opTaskStatus.statusLabel}
                          </span>
                        </div>
                      </div>

                      <div className="do-gmail-filters do-gmail-task-filters">
                        <label className="do-gmail-task-date-field">
                          <Calendar size={12} />
                          <span>From</span>
                          <input
                            className="sa-op-filter"
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
                        </label>
                        <label className="do-gmail-task-date-field">
                          <span>To</span>
                          <input
                            className="sa-op-filter"
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
                        </label>
                        <div className="do-gmail-task-actions">
                          <button
                            type="button"
                            className="do-gmail-task-btn primary"
                            onClick={() => applyOpTaskDateRange(op, opTaskFromDate, opTaskToDate)}
                            disabled={opTaskLogsLoading || !opTaskFromDate || !opTaskToDate}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            className="do-gmail-task-btn"
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
                            className="do-gmail-task-btn"
                            onClick={() => loadOpTaskStatus(op, opTaskAppliedFrom, opTaskAppliedTo)}
                            disabled={opTaskLogsLoading}
                          >
                            {opTaskLogsLoading ? 'Refreshing…' : 'Refresh'}
                          </button>
                        </div>
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
                              className={`do-gmail-task-btn${active ? ' active' : ''}`}
                              onClick={() => applyOpTaskDateRange(op, range.fromDate, range.toDate)}
                              disabled={opTaskLogsLoading}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="do-gmail-task-stats">
                        <div className="do-gmail-task-stat completed">
                          <strong>{opTaskStatus.completed}</strong>
                          <span>Completed</span>
                        </div>
                        <div className="do-gmail-task-stat pending">
                          <strong>{opTaskStatus.pending}</strong>
                          <span>Pending</span>
                        </div>
                        <div className="do-gmail-task-stat overdue">
                          <strong>{opTaskStatus.overdue}</strong>
                          <span>Overdue</span>
                        </div>
                      </div>

                      {opTaskLogsError && (
                        <div className="do-gmail-empty" style={{ color: '#c5221f' }}>{opTaskLogsError}</div>
                      )}

                      {!op.warehouse_name ? (
                        <div className="do-gmail-empty">Configure warehouse access to track chamber tasks.</div>
                      ) : opMappingsLoading && opActiveAssignments.length === 0 ? (
                        <SaDataLoading label="Loading assignments…" compact />
                      ) : opActiveAssignments.length === 0 ? (
                        <div className="do-gmail-empty">No active chamber clients assigned for this operator.</div>
                      ) : opTaskLogsLoading && opTaskStatus.total === 0 ? (
                        <SaDataLoading label="Loading task status…" compact />
                      ) : (
                        <>
                          <div className="do-gmail-filters">
                            {[
                              { id: 'all', label: 'All', count: opTaskStatus.total },
                              { id: 'completed', label: 'Completed', count: opTaskStatus.completed },
                              { id: 'pending', label: 'Pending', count: opTaskStatus.pending },
                              { id: 'overdue', label: 'Overdue', count: opTaskStatus.overdue }
                            ].map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`do-gmail-chip${opTaskFilter === item.id ? ' active' : ''}`}
                                onClick={() => setOpTaskFilter(item.id)}
                              >
                                {item.label} ({item.count})
                              </button>
                            ))}
                          </div>

                          {filteredOpTasks.length === 0 ? (
                            <div className="do-gmail-empty">No tasks in this filter for the selected dates.</div>
                          ) : (
                            <>
                              <div className="do-gmail-inbox-head do-gmail-task-head">
                                <span>Date</span>
                                <span>Shift</span>
                                <span className="do-gmail-task-chamber-col">
                                  <label className="do-gmail-task-chamber-filter">
                                    <span className="do-gmail-task-chamber-filter-label">Chamber</span>
                                    <select
                                      value={opTaskChamberFilter}
                                      onChange={(e) => setOpTaskChamberFilter(e.target.value)}
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
                                </span>
                                <span style={{ textAlign: 'right' }}>Status</span>
                                <span style={{ textAlign: 'right' }}>View</span>
                              </div>
                              <div className="do-gmail-task-list">
                                {filteredOpTasks.slice(0, 120).map((task) => (
                                  <div key={`${task.date}-${task.shift}-${task.chamber_name}-${task.client_name}`} className="do-gmail-inbox-row do-gmail-task-row">
                                    <span className="do-gmail-date">{task.date}</span>
                                    <span className="do-gmail-snippet">{task.shift}</span>
                                    <span className="do-gmail-snippet">
                                      {task.chamber_name}
                                      {' · '}
                                      {task.client_name}
                                      {task.reference_no ? ` · ${task.reference_no}` : ''}
                                    </span>
                                    <span className={`do-gmail-status ${task.status}`}>
                                      {task.status === 'completed' ? 'Completed' : task.status === 'pending' ? 'Pending' : 'Overdue'}
                                    </span>
                                    <span className="do-gmail-task-view">
                                      {task.status === 'completed' && (task.log || task.reference_no) ? (
                                        <button
                                          type="button"
                                          className="do-gmail-text-btn"
                                          onClick={() => openChamberTaskProfile(task, op)}
                                          title="Open log profile"
                                        >
                                          <Eye size={12} />
                                          View
                                        </button>
                                      ) : (
                                        <span className="do-gmail-task-view-muted">—</span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {filteredOpTasks.length > 120 && (
                                <div className="do-gmail-empty">
                                  Showing first 120 of {filteredOpTasks.length} tasks — narrow the filters to see more.
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                    )}

                    {opProfileSection === 'mappings' && (
                    <div className="do-gmail-panel do-map-panel">
                      <div className="do-gmail-toolbar">
                        <div>
                          <h3 className="do-gmail-title">Chamber & Client Mappings</h3>
                          <p className="do-gmail-sub">
                            {op.warehouse_name
                              ? `Which clients sit in which chamber at ${op.warehouse_name}`
                              : 'Configure warehouse access to see chamber mappings.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="sa-op-btn-export"
                          onClick={() => handleExportOpChamberClientMappings(op)}
                          disabled={opMappingsLoading || !op.warehouse_name}
                          title="Export this DO chamber and client list"
                        >
                          <Download size={14} />
                          Export
                        </button>
                      </div>

                      {opMappingsError && (
                        <div className="do-gmail-empty" style={{ color: '#c5221f' }}>{opMappingsError}</div>
                      )}
                      {opMappingsSuccess && opMasterEditMode && (
                        <div className="do-gmail-empty" style={{ color: '#188038' }}>{opMappingsSuccess}</div>
                      )}

                      {!op.warehouse_name ? (
                        <div className="do-gmail-empty">Warehouse is not configured for this operator.</div>
                      ) : opMappingsLoading ? (
                        <SaDataLoading label={`Loading mappings for ${op.warehouse_name}…`} compact />
                      ) : (
                        (() => {
                          const mappingSummary = opDisplayChambers.reduce(
                            (acc, chamberRow) => {
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
                              acc.active += activeClients.length;
                              acc.deactive += deactiveClients.length;
                              return acc;
                            },
                            { active: 0, deactive: 0 }
                          );
                          const chamberLimit = op.chamber_limit || 4;
                          return (
                        <>
                          <div className="do-map-summary">
                            <div className="do-map-summary-item">
                              <span>Warehouse</span>
                              <strong>{op.warehouse_name}</strong>
                            </div>
                            <div className="do-map-summary-item">
                              <span>Chambers used</span>
                              <strong>
                                {opDisplayChambers.length}
                                <em> / {chamberLimit}</em>
                              </strong>
                            </div>
                            <div className="do-map-summary-item">
                              <span>Active clients</span>
                              <strong className="do-map-tone-good">{mappingSummary.active}</strong>
                            </div>
                            <div className="do-map-summary-item">
                              <span>Deactive clients</span>
                              <strong className="do-map-tone-bad">{mappingSummary.deactive}</strong>
                            </div>
                          </div>

                          {opMasterEditMode ? (
                            <div className="do-map-edit-banner">
                              Editing master — add a chamber below, or edit/delete on each chamber card. Deletes have 30s Undo.
                            </div>
                          ) : (
                            <div className="do-map-hint">
                              Each block is one chamber. Use <strong>Edit Master</strong> on a chamber to add another chamber, update type, or manage clients.
                            </div>
                          )}

                          {opMasterEditMode ? (
                            <div className="do-map-add-chamber">
                              <div className="do-map-add-chamber-title">Add chamber</div>
                              <div className="do-map-add-chamber-row">
                                <input
                                  type="text"
                                  placeholder={`e.g. Chamber ${(Number(op.chamber_limit) || 4) + 1}`}
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
                                  className="do-gmail-add-btn"
                                  disabled={addingOpChamber}
                                  onClick={() => handleAddOpChamber(op)}
                                >
                                  {addingOpChamber ? 'Adding…' : 'Add chamber'}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {opDisplayChambers.length === 0 ? (
                            <div className="do-gmail-empty">
                              {opMasterEditMode
                                ? 'No chambers yet — use Add chamber above.'
                                : 'No chambers assigned yet. Open Edit Master to add one, or approve a DO add request from mobile.'}
                            </div>
                          ) : (
                            <div className="do-map-chambers">
                              {opDisplayChambers.map((chamberRow, chamberIdx) => {
                            const chamberNum = chamberRow.chamberNum;
                            const chamberName = chamberRow.name;
                            const chamberAssignments = opMappings.filter((m) =>
                              assignmentMatchesDisplayChamber(m, chamberRow)
                            );
                            const activeClients = uniqueClientsByName(chamberAssignments.filter((m) => !isDeactiveAssignment(m)));
                            const activeNames = new Set(activeClients.map((m) => String(m.client_name || '').trim().toLowerCase()));
                            const deactiveClients = uniqueClientsByName(
                              chamberAssignments.filter((m) => isDeactiveAssignment(m) && !activeNames.has(String(m.client_name || '').trim().toLowerCase()))
                            );
                            const chamberType =
                              activeClients[0]?.chamber_type ||
                              deactiveClients[0]?.chamber_type ||
                              (chamberNum != null ? opChamberTypeByNum[chamberNum] : null) ||
                              (chamberNum != null ? newChamberTypes[chamberNum] : null) ||
                              chamberRow.chamber_type ||
                              'Frozen';
                            const resolvedChamberId = chamberRow.id;
                            const typeEditKey = chamberNum != null ? chamberNum : `id-${resolvedChamberId}`;
                            const typeTone =
                              String(chamberType).toLowerCase() === 'chilled'
                                ? 'chilled'
                                : String(chamberType).toLowerCase() === 'dry'
                                  ? 'dry'
                                  : String(chamberType).toLowerCase() === 'other'
                                    ? 'other'
                                    : 'frozen';
                            return (
                              <div key={chamberRow.slotKey} className="do-map-chamber">
                                <div className="do-map-chamber-head">
                                  <div className="do-map-chamber-title">
                                    <span className="do-map-chamber-index">{chamberIdx + 1}</span>
                                    <div>
                                      <strong>{chamberName}</strong>
                                      <p>
                                        {activeClients.length} active
                                        {deactiveClients.length > 0 ? ` · ${deactiveClients.length} deactive` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="do-map-chamber-meta">
                                    <span className={`do-map-type-pill ${typeTone}`}>{chamberType}</span>
                                    {opMasterEditMode ? (
                                      <div className="do-map-edit-actions">
                                        <button
                                          type="button"
                                          className="do-gmail-text-btn"
                                          onClick={cancelOpMasterEdit}
                                        >
                                          <X size={12} />
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          className="do-gmail-text-btn active"
                                          onClick={() => finishOpMasterEdit(op)}
                                        >
                                          <Check size={12} />
                                          Done
                                        </button>
                                        <button
                                          type="button"
                                          className="do-gmail-chamber-delete"
                                          disabled={
                                            !!pendingMasterDelete &&
                                            pendingMasterDelete.kind === 'chamber' &&
                                            Number(pendingMasterDelete.chamberId) === Number(resolvedChamberId)
                                          }
                                          title={`Delete ${chamberName}`}
                                          onClick={() =>
                                            handleDeleteOpChamber(op, resolvedChamberId, chamberName)
                                          }
                                        >
                                          <Trash2 size={13} />
                                          Delete
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        className="do-gmail-text-btn"
                                        onClick={() => {
                                          setOpMappingsError('');
                                          setOpMappingsSuccess('');
                                          setOpMasterSessionChanges([]);
                                          setOpMasterEditMode(true);
                                        }}
                                      >
                                        <Edit size={12} />
                                        Edit Master
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {opMasterEditMode ? (
                                  <div className="do-gmail-type-row do-map-type-row">
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
                                      className="do-gmail-type-btn"
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

                                <div className="do-map-clients">
                                  {activeClients.length === 0 && deactiveClients.length === 0 && !opMasterEditMode ? (
                                    <div className="do-map-empty-clients">No clients in this chamber yet.</div>
                                  ) : null}

                                  {activeClients.length > 0 ? (
                                    <div className="do-map-client-group">
                                      <div className="do-map-client-group-label">
                                        <span className="do-map-dot good" />
                                        Active clients
                                      </div>
                                      {activeClients.map((assign, aIdx) => (
                                        <div
                                          key={`active-${assign.client_name}-${aIdx}`}
                                          className={`do-map-client-row${opMasterEditMode ? ' editing' : ''}`}
                                        >
                                          <span className="do-map-client-name">{assign.client_name}</span>
                                          <span className="do-gmail-status-pill good">Active</span>
                                          {opMasterEditMode ? (
                                            <button
                                              type="button"
                                              className="do-gmail-row-action"
                                              title={`Remove ${assign.client_name}`}
                                              onClick={() =>
                                                handleDeleteOpMapping(
                                                  op,
                                                  assign.chamber_id || resolvedChamberId,
                                                  assign.client_name,
                                                  chamberName
                                                )
                                              }
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}

                                  {deactiveClients.length > 0 ? (
                                    <div className="do-map-client-group">
                                      <div className="do-map-client-group-label">
                                        <span className="do-map-dot bad" />
                                        Deactive clients
                                      </div>
                                      {deactiveClients.map((assign, aIdx) => (
                                        <div
                                          key={`deactive-${assign.client_name}-${aIdx}`}
                                          className="do-map-client-row deactive"
                                        >
                                          <span className="do-map-client-name">{assign.client_name}</span>
                                          <span className="do-gmail-status-pill muted">Deactive</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}

                                  {opMasterEditMode ? (
                                    <div className="do-gmail-add-row do-map-add-row">
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
                                        className="do-gmail-add-btn"
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
                    <div className="do-gmail-panel">
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
              <div className="sa-op-gmail">
                <section className="sa-op-card">
                  <div className="sa-op-card-head">
                    <div className="sa-op-card-icon">{editingOp ? <Edit size={14} /> : <UserPlus size={14} />}</div>
                    <div>
                      <h2 className="sa-op-title">{editingOp ? 'Modify Operator Profile' : 'Register New Data Operator'}</h2>
                      <p className="sa-op-sub">
                        {editingOp
                          ? editingOp.email
                          : 'All fields are required. Warehouse / Data Access scopes this operator to one warehouse.'}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveOperator} className="sa-op-form">
                    <div className="sa-op-form-grid">
                      <label className="sa-op-field">
                        <span>Full Name</span>
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
                      </label>

                      <label className="sa-op-field">
                        <span>Phone No.</span>
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
                      </label>

                      <label className="sa-op-field sa-op-field-wide">
                        <span>Email ID</span>
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
                      </label>

                      <label className="sa-op-field">
                        <span>{editingOp ? 'Password (leave blank to keep)' : 'Password'}</span>
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
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </label>

                      <label className="sa-op-field">
                        <span>Warehouse / Data Access</span>
                        <input
                          type="text"
                          name="op-warehouse"
                          list="do-warehouse-datalist"
                          placeholder={
                            warehouseSelectOptions.length === 0
                              ? 'Type warehouse name (e.g. Mumbai Cold Store)'
                              : 'Type or pick warehouse from list'
                          }
                          value={opWarehouseName}
                          onChange={(e) => setOpWarehouseName(e.target.value)}
                          required
                          autoComplete="off"
                        />
                        <datalist id="do-warehouse-datalist">
                          {warehouseSelectOptions.map((wh) => (
                            <option key={wh.value} value={wh.value}>{wh.label}</option>
                          ))}
                        </datalist>
                        <em>
                          {warehouseSelectOptions.length === 0
                            ? 'No Master Data warehouses yet — type the warehouse name here, or add warehouses under Master Data first.'
                            : editingOp
                              ? 'Updates profile + past logs for this operator. New tasks also use this warehouse.'
                              : 'Pick from the list or type a warehouse name. Add new warehouses in Master Data to manage codes.'}
                        </em>
                      </label>

                      <label className="sa-op-field">
                        <span>Total Chambers Assigned</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          placeholder="e.g. 4"
                          value={opChamberLimit}
                          onChange={(e) => setOpChamberLimit(e.target.value)}
                          required
                        />
                      </label>
                    </div>

                    <div className="sa-op-form-actions">
                      {editingOp && (
                        <button type="button" className="sa-op-btn-text" onClick={cancelEditOperator}>
                          Cancel
                        </button>
                      )}
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
                        ) : (editingOp ? 'Update Operator' : 'Register Operator')}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="sa-op-card sa-op-directory">
                  {(() => {
                    const filteredOperators = operators.filter((op) => {
                      const term = operatorSearch.toLowerCase();
                      return (
                        (op.full_name && op.full_name.toLowerCase().includes(term)) ||
                        (op.warehouse_name && op.warehouse_name.toLowerCase().includes(term)) ||
                        (op.email && op.email.toLowerCase().includes(term))
                      );
                    });
                    return (
                      <>
                        <div className="sa-op-dir-toolbar">
                          <div>
                            <h2 className="sa-op-title">Registered Operators Directory</h2>
                            <p className="sa-op-sub">
                              {filteredOperators.length} operator{filteredOperators.length === 1 ? '' : 's'} · search, view or edit profiles
                            </p>
                          </div>
                          <div className="sa-op-dir-tools">
                            <label className="sa-op-search">
                              <Search size={14} />
                              <input
                                type="search"
                                placeholder="Search mail-style: name, email, warehouse"
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
                            <div className="sa-op-inbox-head">
                              <span>Operator</span>
                              <span>Details</span>
                              <span>Registered</span>
                              <span>Actions</span>
                            </div>
                            {filteredOperators.map((op) => {
                              if (!op) return null;
                              const initials = String(op.full_name || op.email || 'DO')
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((p) => p[0]?.toUpperCase())
                                .join('') || 'DO';
                              return (
                                <div key={op.id} className="sa-op-inbox-row">
                                  <button
                                    type="button"
                                    className="sa-op-inbox-main"
                                    onClick={() => openOperatorProfile(op)}
                                    title="View DO Profile"
                                  >
                                    <span className="sa-op-avatar">{initials}</span>
                                    <span className="sa-op-sender">
                                      <strong>{op.full_name || 'Unnamed operator'}</strong>
                                      <em>#{op.id}</em>
                                    </span>
                                    <span className="sa-op-snippet">
                                      {op.email}
                                      {' · '}
                                      {op.warehouse_name || 'Warehouse not configured'}
                                      {' · '}
                                      Chambers 1–{op.chamber_limit || 4}
                                      {op.phone_no ? ` · ${formatIndiaPhoneDisplay(op.phone_no)}` : ''}
                                    </span>
                                    <span className="sa-op-date">
                                      {op.created_at ? new Date(op.created_at).toLocaleDateString('en-GB') : '—'}
                                    </span>
                                  </button>
                                  <div className="sa-op-row-actions">
                                    <button type="button" className="sa-op-icon-btn" onClick={() => openOperatorProfile(op)} title="View">
                                      <Eye size={14} />
                                    </button>
                                    <button type="button" className="sa-op-icon-btn" onClick={() => startEditOperator(op)} title="Edit">
                                      <Edit size={14} />
                                    </button>
                                    <button type="button" className="sa-op-icon-btn danger" onClick={() => handleDeleteOperator(op)} title="Revoke">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
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

        {activeMenu === 'customer_reports' && (
          <div className="sa-um">
            <div className="sa-gmail-tabs">
              <button
                type="button"
                className={`sa-gmail-tab${customerReportsTab === 'issues' ? ' active' : ''}`}
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
                className={`sa-gmail-tab${customerReportsTab === 'notes' ? ' active' : ''}`}
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
              <div className="sa-op-gmail">
                <section className="sa-op-card">
                  <div className="sa-op-dir-toolbar">
                    <div>
                      <h2 className="sa-op-title">Customer Notes & Updates</h2>
                      <p className="sa-op-sub">
                        Chat-style notes to customers. They see these on mobile Dashboard → Updates.
                      </p>
                    </div>
                    <div className="sa-op-dir-tools">
                      <button
                        type="button"
                        className="sa-op-btn-text"
                        onClick={() => {
                          loadNoteThreads();
                          loadNoteMessages(selectedNoteCustomer || 'All');
                        }}
                        disabled={loadingNotes}
                      >
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
              </div>
            ) : (
              <div className="sa-op-gmail">
                <section className="sa-op-card sa-op-directory">
                  <div className="sa-op-dir-toolbar">
                    <div>
                      <h2 className="sa-op-title">Customer Reports</h2>
                      <p className="sa-op-sub">
                        {customerReports.length} issue{customerReports.length === 1 ? '' : 's'} · customer, Ref No., and message
                      </p>
                    </div>
                    <div className="sa-op-dir-tools">
                      <label className="sa-op-search">
                        <Search size={14} />
                        <input
                          type="search"
                          placeholder="Search mail-style: name, email, Ref No., issue"
                          value={customerReportSearch}
                          onChange={(e) => setCustomerReportSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') loadCustomerReportsData();
                          }}
                        />
                      </label>
                      <select
                        className="sa-op-filter"
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
                    <div className="sa-op-inbox">
                      {customerReports.map((report) => {
                        if (!report) return null;
                        const initials = String(report.customer_name || report.customer_email || 'CU')
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join('') || 'CU';
                        const statusKey =
                          report.status === 'In Progress' ? 'progress'
                            : String(report.status || 'closed').toLowerCase();
                        return (
                          <div key={report.id} className="sa-op-inbox-row">
                            <div className="sa-op-inbox-main sa-cr-report-main">
                              <span className="sa-op-avatar">{initials}</span>
                              <span className="sa-op-sender">
                                <strong>{report.customer_name || 'Unnamed customer'}</strong>
                                <em>{report.customer_email || '—'}</em>
                              </span>
                              <span className="sa-op-snippet">
                                {report.reference_no || 'Query'}
                                {report.message ? ` · ${report.message}` : ''}
                                {' · '}
                                {report.allowed_clients || 'All clients'}
                                {' · '}
                                {report.allowed_warehouses || 'All warehouses'}
                                {report.customer_phone ? ` · ${report.customer_phone}` : ''}
                              </span>
                              <span className="sa-op-date">
                                <span className={`sa-cr-pill ${statusKey}`}>{report.status || '—'}</span>
                                {' '}
                                {report.created_at
                                  ? new Date(report.created_at).toLocaleDateString('en-GB')
                                  : '—'}
                              </span>
                            </div>
                            <div className="sa-op-row-actions">
                              <select
                                className="sa-cr-status-select"
                                value={report.status}
                                disabled={updatingReportId === report.id}
                                onChange={(e) => handleUpdateCustomerReportStatus(report.id, e.target.value)}
                                title="Update status"
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
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
          <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="profile-modal-header">
              <h3>
                <History size={20} color="var(--primary)" />
                <span>Log Details: {selectedDetailLog.reference_no || `ID: ${selectedDetailLog.id || selectedDetailLog.inward_id || selectedDetailLog.outward_id}`}</span>
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => startSaEditLog(detailType || (selectedDetailLog.inward_id ? 'inward' : selectedDetailLog.outward_id ? 'outward' : 'daily'), selectedDetailLog)}
                  title="Edit (Super Admin — no permission)"
                  style={{ backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  <Edit size={14} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleSaDeleteLog(detailType || (selectedDetailLog.inward_id ? 'inward' : selectedDetailLog.outward_id ? 'outward' : 'daily'), selectedDetailLog)}
                  title="Delete (Super Admin — no permission)"
                  style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button className="profile-modal-close-btn" onClick={() => {
                  setSelectedDetailLog(null);
                  setRecordAllowHistory([]);
                }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="profile-modal-body">
              {/* Left Column: Data Fields */}
              <div className="profile-details-section">
                {detailType !== 'daily' && (
                  <div className="profile-group-card">
                    <div className="profile-group-title">Metadata & Warehouse</div>
                    <div className="profile-grid-list">
                      <div className="profile-item">
                        <span className="profile-label">Warehouse Facility</span>
                        <span className="profile-value">{selectedDetailLog.warehouse_name || '-'}</span>
                      </div>
                      <div className="profile-item">
                        <span className="profile-label">Recorded By Operator</span>
                        <span className="profile-value">{renderOperatorEmail(selectedDetailLog.operator_email)}</span>
                      </div>
                      <div className="profile-item">
                        <span className="profile-label">Created Time</span>
                        <span className="profile-value">{formatDateTimeStr(selectedDetailLog.created_at || selectedDetailLog.inward_created_at || selectedDetailLog.outward_created_at)}</span>
                      </div>
                      <div className="profile-item">
                        <span className="profile-label">Last Updated Time</span>
                        <span
                          className="profile-value"
                          style={
                            formatUpdatedAtStr(
                              selectedDetailLog.created_at || selectedDetailLog.inward_created_at || selectedDetailLog.outward_created_at,
                              selectedDetailLog.updated_at || selectedDetailLog.inward_updated_at || selectedDetailLog.outward_updated_at
                            ) !== '-'
                              ? { color: '#0284c7', fontWeight: '800' }
                              : undefined
                          }
                        >
                          {formatUpdatedAtStr(
                            selectedDetailLog.created_at || selectedDetailLog.inward_created_at || selectedDetailLog.outward_created_at,
                            selectedDetailLog.updated_at || selectedDetailLog.inward_updated_at || selectedDetailLog.outward_updated_at
                          )}
                        </span>
                      </div>
                      {(Number(selectedDetailLog.update_count) > 0 || selectedDetailLog.update_details) && (
                        <div className="profile-item" style={{ gridColumn: 'span 2' }}>
                          <span className="profile-label" style={{ color: 'var(--primary)', fontWeight: '800' }}>
                            Last Updated Details
                          </span>
                          <span className="profile-value" style={{ fontWeight: '700', color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>
                            Changed {Number(selectedDetailLog.update_count) > 0 ? selectedDetailLog.update_count : 1}{' '}
                            {Number(selectedDetailLog.update_count) === 1 ? 'time' : 'times'}
                          </span>
                          {selectedDetailLog.update_details
                            ? renderUpdateDetailsReadable(selectedDetailLog.update_details)
                            : null}
                        </div>
                      )}
                      {selectedDetailLog.remarks || selectedDetailLog.inward_remarks || selectedDetailLog.outward_remarks ? (
                        <div className="profile-item" style={{ gridColumn: 'span 2' }}>
                          <span className="profile-label">Remarks</span>
                          <span className="profile-value profile-value-remarks">
                            {selectedDetailLog.remarks || selectedDetailLog.inward_remarks || selectedDetailLog.outward_remarks}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {detailType === 'daily' && renderChamberLogFormView(selectedDetailLog)}

                {renderSuperAllowSection(selectedDetailLog)}

                {detailType === 'inward' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">Vehicle & General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(selectedDetailLog.inward_entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span className="profile-value">{selectedDetailLog.reference_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Number</span>
                          <span className="profile-value">{selectedDetailLog.inward_vehicle_no}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{selectedDetailLog.inward_client_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Dock Number</span>
                          <span className="profile-value">{selectedDetailLog.inward_dock_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Seal Number</span>
                          <span className="profile-value">{selectedDetailLog.inward_seal_no || '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Logistics Details</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Temp</span>
                          <span className="profile-value">{selectedDetailLog.inward_vehicle_temp !== null ? `${selectedDetailLog.inward_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Temp</span>
                          <span className="profile-value">{selectedDetailLog.inward_material_temp !== null ? `${selectedDetailLog.inward_material_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Pallets In Quantity</span>
                          <span className="profile-value">{selectedDetailLog.inward_pallets_in_qty || '0'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Type</span>
                          <span className="profile-value">{selectedDetailLog.inward_material_type || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Supervisor</span>
                          <span className="profile-value">{selectedDetailLog.inward_unloading_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice / Received Qty</span>
                          <span className="profile-value">{selectedDetailLog.inward_invoice_qty || '0'} / {selectedDetailLog.inward_received_qty || '0'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Driver & Timing Info</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Transporter</span>
                          <span className="profile-value">{selectedDetailLog.inward_transporter_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Name</span>
                          <span className="profile-value">{selectedDetailLog.inward_driver_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Phone</span>
                          <span className="profile-value">{selectedDetailLog.inward_driver_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reporting Time</span>
                          <span className="profile-value">{selectedDetailLog.inward_vehicle_reporting_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Start</span>
                          <span className="profile-value">{selectedDetailLog.inward_unloading_start_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading End</span>
                          <span className="profile-value">{selectedDetailLog.inward_unloading_end_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Unloading Duration</span>
                          <span className="profile-value">
                            <strong>{formatDuration(selectedDetailLog.inward_unloading_duration_hours, selectedDetailLog.inward_unloading_duration_mins)}</strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {selectedDetailLog.inward_unloading_start_time || '-'}</div>
                                <div>E: {selectedDetailLog.inward_unloading_end_time || '-'}</div>
                            </div>
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {detailType === 'outward' && (
                  <>
                    <div className="profile-group-card">
                      <div className="profile-group-title">Vehicle & General Information</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Date</span>
                          <span className="profile-value">{formatDateStr(selectedDetailLog.outward_entry_date)}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reference No</span>
                          <span className="profile-value">{selectedDetailLog.reference_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Vehicle Number</span>
                          <span className="profile-value">{selectedDetailLog.outward_vehicle_no}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Client Name</span>
                          <span className="profile-value">{selectedDetailLog.outward_client_name}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Dock Number</span>
                          <span className="profile-value">{selectedDetailLog.outward_dock_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Seal Number</span>
                          <span className="profile-value">{selectedDetailLog.outward_seal_no || '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Temperature & Logistics Details</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Pre-Cooling Temp</span>
                          <span className="profile-value">{selectedDetailLog.outward_pre_vehicle_temp !== null ? `${selectedDetailLog.outward_pre_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Temp</span>
                          <span className="profile-value">{selectedDetailLog.outward_vehicle_temp !== null ? `${selectedDetailLog.outward_vehicle_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Temp</span>
                          <span className="profile-value">{selectedDetailLog.outward_material_temp !== null ? `${selectedDetailLog.outward_material_temp}°C` : '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Pallets Out Quantity</span>
                          <span className="profile-value">{selectedDetailLog.outward_pallets_in_qty || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Material Type</span>
                          <span className="profile-value">{selectedDetailLog.outward_material_type || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Supervisor</span>
                          <span className="profile-value">{selectedDetailLog.outward_loading_supervisor_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Invoice / Loaded Qty</span>
                          <span className="profile-value">{selectedDetailLog.outward_invoice_qty || '0'} / {selectedDetailLog.outward_received_qty || '0'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-group-card">
                      <div className="profile-group-title">Driver & Timing Info</div>
                      <div className="profile-grid-list">
                        <div className="profile-item">
                          <span className="profile-label">Transporter</span>
                          <span className="profile-value">{selectedDetailLog.outward_transporter_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Name</span>
                          <span className="profile-value">{selectedDetailLog.outward_driver_name || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Driver Phone</span>
                          <span className="profile-value">{selectedDetailLog.outward_driver_no || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Reporting Time</span>
                          <span className="profile-value">{selectedDetailLog.outward_vehicle_reporting_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Start</span>
                          <span className="profile-value">{selectedDetailLog.outward_loading_start_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading End</span>
                          <span className="profile-value">{selectedDetailLog.outward_loading_end_time || '-'}</span>
                        </div>
                        <div className="profile-item">
                          <span className="profile-label">Loading Duration</span>
                          <span className="profile-value">
                            <strong>{formatDuration(selectedDetailLog.outward_loading_duration_hours, selectedDetailLog.outward_loading_duration_mins)}</strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <div>S: {selectedDetailLog.outward_loading_start_time || '-'}</div>
                                <div>E: {selectedDetailLog.outward_loading_end_time || '-'}</div>
                            </div>
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {(detailType === 'inward' || detailType === 'outward') &&
                  renderPhotoCaptureMetadataPanel(selectedDetailLog.photo_capture_metadata)}
              </div>

              {/* Right Column: Uploaded Photos & Files */}
              <div className="profile-photos-section">
                <h4>Uploaded Audit Attachment Photos</h4>
                
                {/* Check if any photos exist */}
                {((detailType === 'daily' && selectedDetailLog.temp_sensor_image) ||
                  (detailType === 'inward' && (
                    selectedDetailLog.inward_invoice_photos ||
                    selectedDetailLog.inward_pod_photo ||
                    selectedDetailLog.inward_vehicle_seal_photo ||
                    selectedDetailLog.inward_vehicle_temp_photo ||
                    selectedDetailLog.inward_material_temp_photo ||
                    selectedDetailLog.inward_vehicle_back_side_photo ||
                    selectedDetailLog.inward_vehicle_back_side_photo_with_material ||
                    selectedDetailLog.inward_count_sheet_photo ||
                    selectedDetailLog.inward_damage_boxes_photo
                  )) ||
                  (detailType === 'outward' && (
                    selectedDetailLog.outward_invoice_photos ||
                    selectedDetailLog.outward_pod_photo ||
                    selectedDetailLog.outward_vehicle_seal_photo ||
                    selectedDetailLog.outward_vehicle_temp_photo ||
                    selectedDetailLog.outward_pre_vehicle_temp_photo ||
                    selectedDetailLog.outward_material_temp_photo ||
                    selectedDetailLog.outward_vehicle_back_side_photo ||
                    selectedDetailLog.outward_vehicle_back_side_photo_with_material ||
                    selectedDetailLog.outward_count_sheet_photo ||
                    selectedDetailLog.outward_damage_boxes_photo
                  ))) ? (
                  <div className="profile-photo-grid">
                    {detailType === 'daily' && selectedDetailLog.temp_sensor_image && (
                      <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.temp_sensor_image))}>
                        <div className="profile-photo-wrapper">
                          <img src={toMediaSrc(selectedDetailLog.temp_sensor_image)} alt="Temp Sensor" />
                        </div>
                        <div className="profile-photo-label">Temp Sensor</div>
                      </div>
                    )}

                    {/* Render Inward Logs Photos */}
                    {detailType === 'inward' && (
                      <>
                        {selectedDetailLog.inward_invoice_photos && selectedDetailLog.inward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`diinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(img)} alt={`Invoice ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                          </div>
                        ))}
                        {selectedDetailLog.inward_pod_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.inward_pod_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.inward_pod_photo)} alt="POD" />
                            </div>
                            <div className="profile-photo-label">POD Photo</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_vehicle_seal_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.inward_vehicle_seal_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.inward_vehicle_seal_photo)} alt="Vehicle Seal" />
                            </div>
                            <div className="profile-photo-label">Vehicle Seal</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.inward_vehicle_temp_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.inward_vehicle_temp_photo)} alt="Vehicle Temp" />
                            </div>
                            <div className="profile-photo-label">Vehicle Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_material_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.inward_material_temp_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.inward_material_temp_photo)} alt="Material Temp" />
                            </div>
                            <div className="profile-photo-label">Material Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_vehicle_back_side_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.inward_vehicle_back_side_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.inward_vehicle_back_side_photo)} alt="Vehicle Back" />
                            </div>
                            <div className="profile-photo-label">Vehicle Back</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_vehicle_back_side_photo_with_material && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.inward_vehicle_back_side_photo_with_material))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.inward_vehicle_back_side_photo_with_material)} alt="Vehicle Back Load" />
                            </div>
                            <div className="profile-photo-label">Vehicle Loaded</div>
                          </div>
                        )}
                        {selectedDetailLog.inward_count_sheet_photo && selectedDetailLog.inward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`dics-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(img)} alt={`Count Sheet ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                          </div>
                        ))}
                        {selectedDetailLog.inward_damage_boxes_photo && selectedDetailLog.inward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
                          <div key={idx} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(dmgImg))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(dmgImg)} alt={`Damage ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">Damage #{idx + 1}</div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Render Outward Logs Photos */}
                    {detailType === 'outward' && (
                      <>
                        {selectedDetailLog.outward_invoice_photos && selectedDetailLog.outward_invoice_photos.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`doinv-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(img)} alt={`Invoice ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Invoice Photo' : `Invoice #${idx + 1}`}</div>
                          </div>
                        ))}
                        {selectedDetailLog.outward_pod_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.outward_pod_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.outward_pod_photo)} alt="POD" />
                            </div>
                            <div className="profile-photo-label">POD Photo</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_vehicle_seal_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.outward_vehicle_seal_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.outward_vehicle_seal_photo)} alt="Vehicle Seal" />
                            </div>
                            <div className="profile-photo-label">Vehicle Seal</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_pre_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.outward_pre_vehicle_temp_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.outward_pre_vehicle_temp_photo)} alt="Pre vehicle temp" />
                            </div>
                            <div className="profile-photo-label">Pre-Cooling Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_vehicle_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.outward_vehicle_temp_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.outward_vehicle_temp_photo)} alt="Vehicle Temp" />
                            </div>
                            <div className="profile-photo-label">Vehicle Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_material_temp_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.outward_material_temp_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.outward_material_temp_photo)} alt="Material Temp" />
                            </div>
                            <div className="profile-photo-label">Material Temp</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_vehicle_back_side_photo && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.outward_vehicle_back_side_photo))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.outward_vehicle_back_side_photo)} alt="Vehicle Back" />
                            </div>
                            <div className="profile-photo-label">Vehicle Back</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_vehicle_back_side_photo_with_material && (
                          <div className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(selectedDetailLog.outward_vehicle_back_side_photo_with_material))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(selectedDetailLog.outward_vehicle_back_side_photo_with_material)} alt="Vehicle Back Load" />
                            </div>
                            <div className="profile-photo-label">Vehicle Loaded</div>
                          </div>
                        )}
                        {selectedDetailLog.outward_count_sheet_photo && selectedDetailLog.outward_count_sheet_photo.split(',').map((p) => p.trim()).filter(Boolean).map((img, idx, arr) => (
                          <div key={`docs-${idx}`} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(img))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(img)} alt={`Count Sheet ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">{arr.length === 1 ? 'Count Sheet' : `Count Sheet #${idx + 1}`}</div>
                          </div>
                        ))}
                        {selectedDetailLog.outward_damage_boxes_photo && selectedDetailLog.outward_damage_boxes_photo.split(',').map((dmgImg, idx) => (
                          <div key={idx} className="profile-photo-card" onClick={() => setLightboxImg(toMediaSrc(dmgImg))}>
                            <div className="profile-photo-wrapper">
                              <img src={toMediaSrc(dmgImg)} alt={`Damage ${idx + 1}`} />
                            </div>
                            <div className="profile-photo-label">Damage #{idx + 1}</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', backgroundColor: 'var(--bg-main)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                    No audit attachment photos uploaded for this record.
                  </div>
                )}
              </div>
            </div>

            <div className="profile-modal-footer">
              <button className="profile-close-btn" onClick={() => {
                setSelectedDetailLog(null);
                setRecordAllowHistory([]);
              }}>Close View</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox View Modal — proper size + click to zoom */}
      {lightboxImg && (
        <div
          className="sa-lightbox-overlay"
          onClick={() => {
            setLightboxImg(null);
            setLightboxZoomed(false);
          }}
        >
          <div
            className={`sa-lightbox-popup${lightboxZoomed ? ' is-zoomed' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sa-lightbox-header">
              <strong>
                Photo Preview
                <span className="sa-lightbox-hint">
                  {lightboxZoomed ? ' · Click image to zoom out' : ' · Click image to zoom in'}
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
                    setLightboxZoomed(false);
                  }}
                  title="Close"
                >
                  <X size={16} />
                  <span>Close</span>
                </button>
              </div>
            </div>
            <div className={`sa-lightbox-body${lightboxZoomed ? ' is-zoomed' : ''}`}>
              <img
                src={lightboxImg}
                alt="Enlarged audit attachment"
                className={lightboxZoomed ? 'is-zoomed' : ''}
                onClick={() => setLightboxZoomed((z) => !z)}
                title={lightboxZoomed ? 'Click to zoom out' : 'Click to zoom in'}
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
