/**
 * WHAT: New Super Admin Control Center dashboard (mockup-style SaaS layout).
 * WHY: Clearer KPI cards, shortcuts, DO tasks, and right-rail monitoring.
 * HOW: Receives all data/handlers from SuperAdminSecureWindow; no API calls here.
 *
 * Undo: set USE_NEW_SA_DASHBOARD = false in saDashboardUi.js
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  User,
  Database,
  Lock,
  Calendar,
  UserPlus,
  Activity,
  History,
  Search,
  MessageSquareWarning,
  ClipboardCheck,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Server,
  Camera,
  MapPin,
  AlertTriangle,
  ChevronDown,
  Users,
  X
} from 'lucide-react';
import LoadErrorBanner from '../../../components/LoadErrorBanner/LoadErrorBanner';
import { fetchHealthSnapshot } from '../../../services/api';
import './SaDashboardControlCenter.css';

function initials(name) {
  const parts = String(name || 'DO')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'DO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function pct(done, expected) {
  const e = Number(expected) || 0;
  const d = Number(done) || 0;
  if (e <= 0) return 0;
  return Math.min(100, Math.round((d / e) * 100));
}

function statusOf(op) {
  const overdue = Number(op.overdue) || 0;
  const pending = Number(op.pending) || 0;
  const expected = Number(op.expected_today) || 0;
  if (overdue > 0) return 'overdue';
  if (pending > 0) return 'pending';
  if (expected > 0) return 'done';
  return 'idle';
}

export default function SaDashboardControlCenter({
  operators = [],
  warehousesList = [],
  customers = [],
  dashboardPendingRequests = [],
  hasPendingRequests = false,
  hasNewDOChanges = false,
  doTaskOverview,
  doTaskSummary = {},
  doTaskRows = [],
  doTaskFromDate,
  setDoTaskFromDate,
  doTaskToDate,
  setDoTaskToDate,
  doTaskFilter,
  setDoTaskFilter,
  doTaskSearch,
  setDoTaskSearch,
  loadingDoTasks = false,
  doTaskError = '',
  setDoTaskError,
  loadDoTaskOverview,
  openDoFromDashboard,
  openDataOperatorsHome,
  setActiveMenu,
  setAuditSubTab,
  localDateStr
}) {
  const [selectedDoKey, setSelectedDoKey] = useState('');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchHealthSnapshot()
      .then((snap) => {
        if (alive) setHealth(snap);
      })
      .catch(() => {
        if (alive) setHealth(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const activeOps = (operators || []).filter(
    (o) => String(o.status || o.account_status || 'active').toLowerCase() !== 'inactive'
  ).length;
  const inactiveOps = Math.max(0, (operators || []).length - activeOps);
  const activeCustomers = (customers || []).filter(
    (c) => String(c.status || 'active').toLowerCase() !== 'inactive'
  ).length;
  const inactiveCustomers = Math.max(0, (customers || []).length - activeCustomers);
  const whTotal = (warehousesList || []).length;

  const filterCounts = useMemo(() => {
    const rows = Array.isArray(doTaskOverview?.operators) ? doTaskOverview.operators : [];
    let pending = 0;
    let overdue = 0;
    let done = 0;
    rows.forEach((op) => {
      const p = Number(op.pending) || 0;
      const o = Number(op.overdue) || 0;
      const e = Number(op.expected_today) || 0;
      if (o > 0) overdue += 1;
      else if (p > 0) pending += 1;
      else if (e > 0) done += 1;
    });
    return { all: rows.length, pending, overdue, done };
  }, [doTaskOverview]);

  const mornDone = Number(doTaskSummary.morning_completed) || 0;
  const mornExp = Number(doTaskSummary.morning_expected) || 0;
  const eveDone = Number(doTaskSummary.evening_completed) || 0;
  const eveExp = Number(doTaskSummary.evening_expected) || 0;
  const overdueTotal = Number(doTaskSummary.overdue) || 0;
  const todayIn = Number(doTaskSummary.today_inward) || 0;
  const todayOut = Number(doTaskSummary.today_outward) || 0;

  const allDoOptions = useMemo(() => {
    const fromOverview = Array.isArray(doTaskOverview?.operators) ? doTaskOverview.operators : [];
    const source = fromOverview.length > 0 ? fromOverview : operators || [];
    const seen = new Set();
    const list = [];
    source.forEach((op) => {
      const email = String(op.email || '').trim().toLowerCase();
      const id = op.id != null ? String(op.id) : '';
      const key = email || (id ? `id:${id}` : '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({
        key,
        id: op.id,
        email: op.email,
        name: op.name || op.full_name || op.email || 'DO',
        warehouse_name: op.warehouse_name,
        row: op
      });
    });
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }, [doTaskOverview, operators]);

  const selectedDo = useMemo(() => {
    if (!selectedDoKey) return null;
    return allDoOptions.find((d) => d.key === selectedDoKey) || null;
  }, [selectedDoKey, allDoOptions]);

  const selectedDoRow = selectedDo?.row || null;

  const viewRows = useMemo(() => {
    if (!selectedDoRow) return doTaskRows;
    const email = String(selectedDoRow.email || '').trim().toLowerCase();
    const id = selectedDoRow.id != null ? Number(selectedDoRow.id) : null;
    const matched = doTaskRows.filter(
      (op) =>
        (email && String(op.email || '').trim().toLowerCase() === email) ||
        (id != null && Number(op.id) === id)
    );
    if (matched.length) return matched;
    return [selectedDoRow];
  }, [doTaskRows, selectedDoRow]);

  const overviewMornDone = selectedDoRow ? Number(selectedDoRow.morning_completed) || 0 : mornDone;
  const overviewMornExp = selectedDoRow
    ? Number(selectedDoRow.morning_expected) || Number(selectedDoRow.assignment_count) || 0
    : mornExp;
  const overviewEveDone = selectedDoRow ? Number(selectedDoRow.evening_completed) || 0 : eveDone;
  const overviewEveExp = selectedDoRow
    ? Number(selectedDoRow.evening_expected) || Number(selectedDoRow.assignment_count) || 0
    : eveExp;
  const overviewOverdue = selectedDoRow ? Number(selectedDoRow.overdue) || 0 : overdueTotal;
  const overviewIn = selectedDoRow ? Number(selectedDoRow.today_inward) || 0 : todayIn;
  const overviewOut = selectedDoRow ? Number(selectedDoRow.today_outward) || 0 : todayOut;
  const selectedStatus = selectedDoRow ? statusOf(selectedDoRow) : null;

  const topWarehouses = useMemo(() => {
    const map = {};
    (doTaskOverview?.operators || []).forEach((op) => {
      const wh = String(op.warehouse_name || '—').trim() || '—';
      if (!map[wh]) map[wh] = { name: wh, in: 0, out: 0 };
      map[wh].in += Number(op.today_inward) || 0;
      map[wh].out += Number(op.today_outward) || 0;
    });
    const list = Object.values(map).sort((a, b) => b.in + b.out - (a.in + a.out));
    const max = Math.max(1, ...list.map((x) => x.in + x.out));
    return list.slice(0, 5).map((x) => ({ ...x, bar: Math.round(((x.in + x.out) / max) * 100) }));
  }, [doTaskOverview]);

  const fromDate =
    String(doTaskOverview?.fromDate || doTaskFromDate || localDateStr()).slice(0, 10);
  const toDate = String(doTaskOverview?.toDate || doTaskToDate || fromDate).slice(0, 10);
  const isSingleDay = fromDate === toDate;
  const isTodayRange = isSingleDay && fromDate === localDateStr();
  const formatRangeDay = (ymd) =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  const dateLabel = isTodayRange
    ? 'Today'
    : isSingleDay
      ? formatRangeDay(fromDate)
      : `${formatRangeDay(fromDate)} → ${formatRangeDay(toDate)}`;
  const ioInLabel = isTodayRange ? 'Today Inward' : isSingleDay ? 'Day Inward' : 'Period Inward';
  const ioOutLabel = isTodayRange
    ? 'Today Outward'
    : isSingleDay
      ? 'Day Outward'
      : 'Period Outward';
  const applyDoTaskRange = () => {
    let from = doTaskFromDate || localDateStr();
    let to = doTaskToDate || from;
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
      setDoTaskFromDate(from);
      setDoTaskToDate(to);
    }
    loadDoTaskOverview({ fromDate: from, toDate: to });
  };
  const clearDoTaskFilters = () => {
    const today = localDateStr();
    setSelectedDoKey('');
    setDoTaskFromDate(today);
    setDoTaskToDate(today);
    loadDoTaskOverview({ fromDate: today, toDate: today });
  };

  const apiOnline = Boolean(health?.ok);
  const dbOnline = Boolean(health?.databaseConnected);

  return (
    <div className="sa-cc">
      <header className="sa-cc-header">
        <div className="sa-cc-header-left">
          <span className="sa-cc-header-icon">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h1>Super Admin Control Center</h1>
            <p>Overview of operators, daily chamber tasks, warehouses and activity</p>
          </div>
        </div>
        <div className="sa-cc-header-right">
          <span className={`sa-cc-live${apiOnline ? '' : ' off'}`}>
            <span className="sa-cc-live-dot" />
            {apiOnline ? 'Live System Monitoring' : 'System check offline'}
          </span>
        </div>
      </header>

      <div className="sa-cc-kpis">
        <button
          type="button"
          className="sa-cc-kpi blue"
          onClick={() => (typeof openDataOperatorsHome === 'function' ? openDataOperatorsHome() : setActiveMenu('data_operators'))}
        >
          <span className="sa-cc-kpi-icon">
            <User size={18} />
          </span>
          <div>
            <span className="sa-cc-kpi-label">Data Operators</span>
            <strong>{operators.length}</strong>
            <span className="sa-cc-kpi-sub">
              Active {activeOps} · Inactive {inactiveOps}
            </span>
          </div>
        </button>
        <div className="sa-cc-kpi purple">
          <span className="sa-cc-kpi-icon">
            <Database size={18} />
          </span>
          <div>
            <span className="sa-cc-kpi-label">Warehouses</span>
            <strong>{whTotal}</strong>
            <span className="sa-cc-kpi-sub">Active {whTotal} · Inactive 0</span>
          </div>
        </div>
        <button type="button" className="sa-cc-kpi teal" onClick={() => setActiveMenu('customers')}>
          <span className="sa-cc-kpi-icon">
            <ShieldCheck size={18} />
          </span>
          <div>
            <span className="sa-cc-kpi-label">Customers</span>
            <strong>{customers.length}</strong>
            <span className="sa-cc-kpi-sub">
              Active {activeCustomers} · Inactive {inactiveCustomers}
            </span>
          </div>
        </button>
        <button
          type="button"
          className={`sa-cc-kpi orange${hasPendingRequests ? ' pulse' : ''}`}
          onClick={() => {
            setActiveMenu('activity_logs');
            setAuditSubTab('permission_log');
          }}
        >
          <span className="sa-cc-kpi-icon">
            <Lock size={18} />
          </span>
          <div>
            <span className="sa-cc-kpi-label">Pending Permission Requests</span>
            <strong>{dashboardPendingRequests.length}</strong>
            <span className="sa-cc-kpi-sub">Needs approval</span>
          </div>
        </button>
      </div>

      <div className="sa-cc-body">
        <div className="sa-cc-col-main">
          <section className="sa-cc-shortcuts">
            <button
              type="button"
              className="sa-cc-shortcut c-blue"
              onClick={() => (typeof openDataOperatorsHome === 'function' ? openDataOperatorsHome() : setActiveMenu('data_operators'))}
            >
              <UserPlus size={14} />
              <span>Register Operator</span>
            </button>
            <button
              type="button"
              className={`sa-cc-shortcut c-purple${hasNewDOChanges ? ' alert' : ''}`}
              onClick={() => {
                setActiveMenu('activity_logs');
                setAuditSubTab('do_changes');
              }}
            >
              <Activity size={14} />
              <span>DO Operations Log</span>
            </button>
            <button type="button" className="sa-cc-shortcut c-slate" onClick={() => setActiveMenu('history_logs')}>
              <History size={14} />
              <span>System Logs</span>
            </button>
            <button type="button" className="sa-cc-shortcut c-green" onClick={() => setActiveMenu('customer_reports')}>
              <MessageSquareWarning size={14} />
              <span>Customer Reports</span>
            </button>
          </section>

          <section className="sa-cc-main">
          <div className="sa-cc-tasks-head">
            <div className="sa-cc-tasks-title">
              <ClipboardCheck size={18} />
              <div>
                <strong>DO Tasks</strong>
                <span>{dateLabel} · Morning + Evening</span>
              </div>
            </div>
          </div>

          <div className="sa-cc-tasks-range">
            <label className="sa-cc-do-select" title="Select a DO to view overview on dashboard">
              <Users size={13} />
              <select
                value={selectedDoKey}
                onChange={(e) => setSelectedDoKey(e.target.value)}
                aria-label="Select DO for dashboard overview"
              >
                <option value="">All DOs</option>
                {allDoOptions.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name}
                    {d.warehouse_name ? ` · ${d.warehouse_name}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="sa-cc-do-select-caret" />
            </label>
            <label className="sa-cc-date compact" title="From date">
              <Calendar size={13} />
              <input
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
            <span className="sa-cc-range-sep">→</span>
            <label className="sa-cc-date compact" title="To date">
              <input
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
              className="sa-cc-apply"
              onClick={applyDoTaskRange}
              disabled={loadingDoTasks || !doTaskFromDate || !doTaskToDate}
            >
              Apply
            </button>
            <button
              type="button"
              className="sa-cc-text-btn"
              onClick={clearDoTaskFilters}
              disabled={loadingDoTasks}
              title="Reset to All DOs and today’s date"
            >
              <X size={13} />
              Clear
            </button>
            <button
              type="button"
              className="sa-cc-text-btn"
              onClick={applyDoTaskRange}
              disabled={loadingDoTasks}
            >
              {loadingDoTasks ? <Loader2 size={13} className="sa-spin" /> : null}
              Refresh
            </button>
          </div>

          <div className="sa-cc-status-row">
            <div className="sa-cc-pills">
              {[
                { id: 'all', label: 'All', n: filterCounts.all },
                { id: 'pending', label: 'Pending', n: filterCounts.pending },
                { id: 'overdue', label: 'Overdue', n: filterCounts.overdue },
                { id: 'done', label: 'Done', n: filterCounts.done }
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`sa-cc-pill${doTaskFilter === p.id ? ' active' : ''}${p.id === 'overdue' ? ' danger' : ''}`}
                  onClick={() => setDoTaskFilter(p.id)}
                >
                  {p.label} ({p.n})
                </button>
              ))}
            </div>
            <label className="sa-cc-search">
              <Search size={14} />
              <input
                type="search"
                value={doTaskSearch}
                onChange={(e) => setDoTaskSearch(e.target.value)}
                placeholder="Search DO or warehouse"
              />
            </label>
          </div>

          {selectedDoRow ? (
            <div className="sa-cc-do-overview">
              <div className="sa-cc-do-overview-head">
                <div className="sa-cc-do-overview-id">
                  <span className="sa-cc-avatar sa-cc-do-overview-avatar" aria-hidden="true">
                    {initials(selectedDo.name)}
                  </span>
                  <div className="sa-cc-do-overview-text">
                    <strong>{selectedDo.name}</strong>
                    <span className="sa-cc-do-overview-meta">
                      {selectedDo.warehouse_name || '—'}
                      {selectedDo.email ? ` · ${selectedDo.email}` : ''}
                    </span>
                  </div>
                </div>
                <div className="sa-cc-do-overview-actions">
                  <span className={`sa-cc-badge ${selectedStatus || 'muted'}`}>
                    {selectedStatus === 'done'
                      ? 'Done'
                      : selectedStatus === 'pending'
                        ? 'Pending'
                        : selectedStatus === 'overdue'
                          ? 'Overdue'
                          : '—'}
                  </span>
                  <button
                    type="button"
                    className="sa-cc-view"
                    onClick={() => openDoFromDashboard(selectedDoRow)}
                  >
                    Full Profile
                  </button>
                </div>
              </div>
              <div className="sa-cc-do-overview-grid">
                <div className="sa-cc-do-ov-card morn">
                  <span>Morning</span>
                  <strong>
                    {overviewMornDone}/{overviewMornExp}
                  </strong>
                  <em>{pct(overviewMornDone, overviewMornExp)}% done</em>
                </div>
                <div className="sa-cc-do-ov-card eve">
                  <span>Evening</span>
                  <strong>
                    {overviewEveDone}/{overviewEveExp}
                  </strong>
                  <em>{pct(overviewEveDone, overviewEveExp)}% done</em>
                </div>
                <div className="sa-cc-do-ov-card in">
                  <span>{ioInLabel}</span>
                  <strong>{overviewIn}</strong>
                  <em>{isSingleDay ? 'Selected day' : 'Selected range'}</em>
                </div>
                <div className="sa-cc-do-ov-card out">
                  <span>{ioOutLabel}</span>
                  <strong>{overviewOut}</strong>
                  <em>{isSingleDay ? 'Selected day' : 'Selected range'}</em>
                </div>
                <div className={`sa-cc-do-ov-card overdue${overviewOverdue > 0 ? ' hot' : ''}`}>
                  <span>Overdue</span>
                  <strong>{overviewOverdue}</strong>
                  <em>Tasks</em>
                </div>
              </div>
            </div>
          ) : null}

          <div className="sa-cc-progress-row">
            <div className="sa-cc-progress">
              <div className="sa-cc-progress-top">
                <span>Morning Tasks</span>
                <b>
                  Done {overviewMornDone} · Expected {overviewMornExp}
                </b>
              </div>
              <div className="sa-cc-bar">
                <span style={{ width: `${pct(overviewMornDone, overviewMornExp)}%` }} />
              </div>
              <em>{pct(overviewMornDone, overviewMornExp)}%</em>
            </div>
            <div className="sa-cc-progress">
              <div className="sa-cc-progress-top">
                <span>Evening Tasks</span>
                <b>
                  Done {overviewEveDone} · Expected {overviewEveExp}
                </b>
              </div>
              <div className="sa-cc-bar eve">
                <span style={{ width: `${pct(overviewEveDone, overviewEveExp)}%` }} />
              </div>
              <em>{pct(overviewEveDone, overviewEveExp)}%</em>
            </div>
            <div className={`sa-cc-overdue-card${overviewOverdue > 0 ? ' hot' : ''}`}>
              <AlertTriangle size={16} />
              <div>
                <strong>Overdue Tasks</strong>
                <span>
                  {overviewOverdue > 0 ? `${overviewOverdue} need attention` : 'None right now'}
                </span>
              </div>
              <b>{overviewOverdue}</b>
            </div>
          </div>

          <div className="sa-cc-io-row">
            <div className="sa-cc-io in">
              <ArrowDownLeft size={16} />
              <div>
                <span>{ioInLabel}</span>
                <strong>{overviewIn.toLocaleString()}</strong>
              </div>
            </div>
            <div className="sa-cc-io out">
              <ArrowUpRight size={16} />
              <div>
                <span>{ioOutLabel}</span>
                <strong>{overviewOut.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {doTaskError ? (
            <div className="sa-cc-banner">
              <LoadErrorBanner
                message={doTaskError}
                onRetry={applyDoTaskRange}
                onDismiss={() => setDoTaskError('')}
              />
            </div>
          ) : null}

          {loadingDoTasks && !doTaskOverview ? (
            <div className="sa-cc-empty">Loading DO tasks…</div>
          ) : viewRows.length === 0 ? (
            <div className="sa-cc-empty">
              {doTaskSearch || doTaskFilter !== 'all' || selectedDoKey
                ? 'No operators match this filter.'
                : 'No data operators yet.'}
            </div>
          ) : (
            <div className="sa-cc-table-wrap">
              <table className="sa-cc-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>DO Name</th>
                    <th>Warehouse</th>
                    <th>Morning</th>
                    <th>Evening</th>
                    <th>Inward</th>
                    <th>Outward</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {viewRows.map((op, idx) => {
                    const name = op.name || op.full_name || 'DO';
                    const email = String(op.email || '').trim();
                    const mornExpRow = Number(op.morning_expected) || Number(op.assignment_count) || 0;
                    const eveExpRow = Number(op.evening_expected) || Number(op.assignment_count) || 0;
                    const mornDoneRow = Number(op.morning_completed) || 0;
                    const eveDoneRow = Number(op.evening_completed) || 0;
                    const inToday = Number(op.today_inward) || 0;
                    const outToday = Number(op.today_outward) || 0;
                    const st = statusOf(op);
                    return (
                      <tr key={`${op.id || op.email || name}-${idx}`}>
                        <td>{idx + 1}</td>
                        <td>
                          <span className="sa-cc-avatar" title={email || name}>
                            {initials(name)}
                          </span>
                          <span className="sa-cc-do-id">
                            <strong>{name}</strong>
                            {email ? <span className="sa-cc-do-email">{email}</span> : null}
                          </span>
                        </td>
                        <td>{op.warehouse_name || '—'}</td>
                        <td>
                          <span className="sa-cc-frac">
                            {mornDoneRow}/{mornExpRow}
                          </span>
                        </td>
                        <td>
                          <span className="sa-cc-frac">
                            {eveDoneRow}/{eveExpRow}
                          </span>
                        </td>
                        <td>
                          <span className="sa-cc-io-count in">{inToday}</span>
                        </td>
                        <td>
                          <span className="sa-cc-io-count out">{outToday}</span>
                        </td>
                        <td>
                          <span className={`sa-cc-badge ${st}`}>
                            {st === 'done' ? 'Done' : st === 'pending' ? 'Pending' : st === 'overdue' ? 'Overdue' : '—'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sa-cc-view"
                            onClick={() => openDoFromDashboard(op)}
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
          )}
          </section>
        </div>

        <aside className="sa-cc-rail">
          <div className="sa-cc-card sa-cc-health-top">
            <h3>Live System Monitoring</h3>
            <ul className="sa-cc-health">
              <li>
                <Server size={15} />
                <div>
                  <strong>Application Server</strong>
                  <span>{health?.backendHost || health?.api || 'API'}</span>
                </div>
                <em className={apiOnline ? 'on' : 'off'}>{apiOnline ? 'Online' : 'Offline'}</em>
              </li>
              <li>
                <Database size={15} />
                <div>
                  <strong>Database</strong>
                  <span>{health?.dbName || health?.dbKind || 'MySQL'}</span>
                </div>
                <em className={dbOnline ? 'on' : 'off'}>{dbOnline ? 'Online' : 'Offline'}</em>
              </li>
              <li>
                <Camera size={15} />
                <div>
                  <strong>Camera Feeds</strong>
                  <span>Capture path ready</span>
                </div>
                <em className="on">Online</em>
              </li>
              <li>
                <MapPin size={15} />
                <div>
                  <strong>Location Services</strong>
                  <span>GPS meta on photos</span>
                </div>
                <em className="on">Online</em>
              </li>
            </ul>
          </div>

          <div className="sa-cc-card">
            <h3>Top Warehouses</h3>
            <p className="sa-cc-card-sub">In / Out on selected day</p>
            {topWarehouses.length === 0 ? (
              <div className="sa-cc-empty sm">No movement today</div>
            ) : (
              <ul className="sa-cc-wh-bars">
                {topWarehouses.map((w) => (
                  <li key={w.name}>
                    <div className="sa-cc-wh-top">
                      <strong>{w.name}</strong>
                      <span>
                        {w.in} In · {w.out} Out
                      </span>
                    </div>
                    <div className="sa-cc-bar thin">
                      <span style={{ width: `${w.bar}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
