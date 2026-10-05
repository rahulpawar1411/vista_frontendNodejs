// ====================================================================
// Customer Secure Window (simple panel, same theme as Super Admin)
// Login: customer email + password from customers table (legacy: sub_admins)
// ====================================================================

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  Activity,
  Thermometer,
  MessageSquareWarning,
  LogOut,
  User,
  Search,
  Loader2,
  Menu,
  X,
  ChevronRight,
  Eye,
  Send,
  ArrowLeft,
  ShieldCheck,
  Building2,
  Warehouse
} from 'lucide-react';
import Logo from '../../components/Logo/Logo';
import CopyableRef from '../../components/LogProfileDetailModal/CopyableRef';
import PaginationBar from '../../components/PaginationBar/PaginationBar';
const SubAdminLogProfileScreen = lazy(() => import('../SubAdminLogProfileScreen/SubAdminLogProfileScreen'));
import {
  fetchChamberLogs,
  fetchInwardLogs,
  fetchOutwardLogs,
  submitCustomerReport
} from '../../services/api';
import '../../components/DOSidebar/DOSidebar.css';
import './SubAdminSecureWindow.css';

const MENU = [
  { id: 'dashboard', label: 'Home', Icon: Activity },
  { id: 'temp_logs', label: 'Temperature Logs', Icon: Thermometer },
  { id: 'report', label: 'Report', Icon: MessageSquareWarning }
];

const LOGS_PER_PAGE = 12;

/**
 * WHAT: Customer (mobile/web) portal to view their temperature logs and submit reports.
 * WHY: Clients need read-only access without Super Admin tools.
 * HOW: Menu tabs load paginated chamber/inward/outward logs scoped to the logged-in customer.
 */
export default function SubAdminSecureWindow({ user, onLogout }) {
  const [activeMenu, setActiveMenu] = useState(() => {
    return localStorage.getItem('sub_admin_active_menu') || 'dashboard';
  });
  const [logTab, setLogTab] = useState('chamber');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [chamberLogs, setChamberLogs] = useState([]);
  const [inwardLogs, setInwardLogs] = useState([]);
  const [outwardLogs, setOutwardLogs] = useState([]);
  const [scopeTotals, setScopeTotals] = useState({ chamber: 0, inward: 0, outward: 0 });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedDetailLog, setSelectedDetailLog] = useState(null);
  const [detailType, setDetailType] = useState('daily');
  const [reportRefNo, setReportRefNo] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  const openLogProfile = (log, type) => {
    setSelectedDetailLog(log);
    setDetailType(type);
  };

  useEffect(() => {
    localStorage.setItem('sub_admin_active_menu', activeMenu);
  }, [activeMenu]);

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

  const allowedClients = user?.allowed_clients
    ? user.allowed_clients.split(',').map((c) => c.trim()).filter(Boolean)
    : [];
  const allowedWarehouses = user?.allowed_warehouses
    ? user.allowed_warehouses.split(',').map((w) => w.trim()).filter(Boolean)
    : [];

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Customer';

  const loadScopeTotals = useCallback(async () => {
    try {
      const countOpts = { paginated: true, page: 1, limit: 1 };
      const [c, i, o] = await Promise.all([
        fetchChamberLogs('', countOpts),
        fetchInwardLogs('', countOpts),
        fetchOutwardLogs('', countOpts)
      ]);
      setScopeTotals({
        chamber: c?.total ?? 0,
        inward: i?.total ?? 0,
        outward: o?.total ?? 0
      });
    } catch (err) {
      console.error('Failed to load scope totals:', err);
    }
  }, []);

  const loadLogPage = useCallback(async () => {
    setLoading(true);
    try {
      const opts = {
        paginated: true,
        page: logPage,
        limit: LOGS_PER_PAGE,
        search: appliedSearch
      };
      if (logTab === 'chamber') {
        const data = await fetchChamberLogs('', opts);
        setChamberLogs(data?.items || []);
        setLogTotal(data?.total ?? 0);
      } else if (logTab === 'inward') {
        const data = await fetchInwardLogs('', opts);
        setInwardLogs(data?.items || []);
        setLogTotal(data?.total ?? 0);
      } else {
        const data = await fetchOutwardLogs('', opts);
        setOutwardLogs(data?.items || []);
        setLogTotal(data?.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
      setChamberLogs([]);
      setInwardLogs([]);
      setOutwardLogs([]);
      setLogTotal(0);
    } finally {
      setLoading(false);
    }
  }, [logTab, logPage, appliedSearch]);

  useEffect(() => {
    if (activeMenu === 'dashboard') {
      loadScopeTotals();
    }
  }, [activeMenu, loadScopeTotals]);

  useEffect(() => {
    if (activeMenu !== 'temp_logs') return;
    loadLogPage();
  }, [activeMenu, loadLogPage]);

  useEffect(() => {
    setLogPage(1);
  }, [logTab]);

  useEffect(() => {
    if (activeMenu !== 'temp_logs') return;
    const t = setTimeout(() => {
      setAppliedSearch(search.trim());
      setLogPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search, activeMenu]);

  const pageTitle = selectedDetailLog
    ? 'Log details'
    : activeMenu === 'temp_logs'
      ? 'Temperature Logs'
      : activeMenu === 'report'
        ? 'Report an Issue'
        : 'Home';

  const selectMenu = (id) => {
    setSelectedDetailLog(null);
    setActiveMenu(id);
    setIsMobileMenuOpen(false);
    if (id === 'report') {
      setReportError('');
      setReportSuccess('');
    }
  };

  // Back only for Logs / Report / details — and only shown on mobile UI
  const canGoBack =
    Boolean(selectedDetailLog) ||
    activeMenu === 'temp_logs' ||
    activeMenu === 'report';

  const handleCustomerBack = () => {
    if (selectedDetailLog) {
      setSelectedDetailLog(null);
      return;
    }
    if (activeMenu === 'temp_logs' || activeMenu === 'report') {
      selectMenu('dashboard');
    }
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    setReportError('');
    setReportSuccess('');
    const ref = reportRefNo.trim();
    const msg = reportMessage.trim();
    if (!ref) {
      setReportError('Please mention the Reference No. of the log.');
      return;
    }
    if (!msg) {
      setReportError('Please type your issue in the message box.');
      return;
    }
    setReportSubmitting(true);
    try {
      const result = await submitCustomerReport({ reference_no: ref, message: msg });
      setReportSuccess(result.message || 'Report submitted successfully.');
      setReportRefNo('');
      setReportMessage('');
    } catch (err) {
      setReportError(err.message || 'Failed to submit report.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const openLogsTab = (tabId) => {
    setSelectedDetailLog(null);
    setLogTab(tabId);
    setActiveMenu('temp_logs');
    setIsMobileMenuOpen(false);
  };

  const formatShortDate = (val) => {
    if (!val) return '—';
    const s = String(val).split('T')[0];
    return s;
  };

  const renderSidebarNav = () => (
    <ul className="do-sidebar-nav sub-admin-do-nav">
      {MENU.map(({ id, label, Icon }) => (
        <li key={id}>
          <button
            type="button"
            className={`do-sidebar-link ${activeMenu === id ? 'active' : ''}`}
            onClick={() => selectMenu(id)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const renderViewCell = (log, type) => (
    <td>
      <button
        type="button"
        className="sub-admin-view-profile-btn"
        onClick={(e) => {
          e.stopPropagation();
          openLogProfile(log, type);
        }}
      >
        <Eye size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        View
      </button>
    </td>
  );

  const renderMobileCard = (row, type) => {
    if (type === 'daily') {
      return (
        <button
          key={row.id}
          type="button"
          className="sub-admin-log-card"
          onClick={() => openLogProfile(row, 'daily')}
        >
          <div className="sub-admin-log-card-top">
            <CopyableRef value={row.reference_no || row.id} className="sub-admin-log-card-ref" />
            <span className="sub-admin-log-card-temp">
              {row.chamber_temp != null && row.chamber_temp !== '' ? `${row.chamber_temp}°C` : '—'}
            </span>
          </div>
          <div className="sub-admin-log-card-client">{row.client_name || '—'}</div>
          <div className="sub-admin-log-card-meta">
            <span>{formatShortDate(row.formatted_date || row.entry_date)}</span>
            <span className="sub-admin-log-card-dot">·</span>
            <span>Chamber: {row.chamber_name || '—'}</span>
          </div>
          <div className="sub-admin-log-card-action">
            <span>View details</span>
            <ChevronRight size={16} />
          </div>
        </button>
      );
    }
    if (type === 'inward') {
      return (
        <button
          key={row.inward_id}
          type="button"
          className="sub-admin-log-card"
          onClick={() => openLogProfile(row, 'inward')}
        >
          <div className="sub-admin-log-card-top">
            <CopyableRef value={row.reference_no || row.inward_id} className="sub-admin-log-card-ref" />
            <span className="sub-admin-log-card-temp">
              {row.inward_vehicle_temp != null && row.inward_vehicle_temp !== '' ? `${row.inward_vehicle_temp}°C` : '—'}
            </span>
          </div>
          <div className="sub-admin-log-card-client">{row.inward_client_name || '—'}</div>
          <div className="sub-admin-log-card-meta">
            <span>{formatShortDate(row.inward_entry_date)}</span>
            <span className="sub-admin-log-card-dot">·</span>
            <span>Vehicle: {row.inward_vehicle_no || '—'}</span>
          </div>
          <div className="sub-admin-log-card-action">
            <span>View details</span>
            <ChevronRight size={16} />
          </div>
        </button>
      );
    }
    return (
      <button
        key={row.outward_id}
        type="button"
        className="sub-admin-log-card"
        onClick={() => openLogProfile(row, 'outward')}
      >
        <div className="sub-admin-log-card-top">
          <CopyableRef value={row.reference_no || row.outward_id} className="sub-admin-log-card-ref" />
          <span className="sub-admin-log-card-temp">
            {row.outward_vehicle_temp != null && row.outward_vehicle_temp !== '' ? `${row.outward_vehicle_temp}°C` : '—'}
          </span>
        </div>
        <div className="sub-admin-log-card-client">{row.outward_client_name || '—'}</div>
        <div className="sub-admin-log-card-meta">
          <span>{formatShortDate(row.outward_entry_date)}</span>
          <span className="sub-admin-log-card-dot">·</span>
          <span>Vehicle: {row.outward_vehicle_no || '—'}</span>
        </div>
        <div className="sub-admin-log-card-action">
          <span>View details</span>
          <ChevronRight size={16} />
        </div>
      </button>
    );
  };

  const renderPagination = () => (
    <PaginationBar
      page={logPage}
      totalItems={logTotal}
      pageSize={LOGS_PER_PAGE}
      onPageChange={setLogPage}
      itemLabel="records"
    />
  );

  const renderEmpty = (message) => (
    <div className="sub-admin-empty-state">
      <Thermometer size={28} color="var(--primary)" />
      <strong>No records yet</strong>
      <p>{message}</p>
    </div>
  );

  const renderLogTable = () => {
    if (loading) {
      return (
        <div className="sub-admin-loading-state">
          <Loader2 size={22} className="spinner-icon" />
          <span>Loading your records…</span>
        </div>
      );
    }

    if (logTab === 'chamber') {
      if (chamberLogs.length === 0) {
        return renderEmpty('No chamber temperature logs in your access scope.');
      }
      return (
        <>
          <div className="sub-admin-log-cards mobile-only">
            {chamberLogs.map((row) => renderMobileCard(row, 'daily'))}
          </div>
          <div className="sub-admin-simple-table-wrap desktop-only">
            <table className="sub-admin-simple-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Chamber</th>
                  <th>Temp</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {chamberLogs.map((row) => (
                  <tr
                    key={row.id}
                    className="sub-admin-log-row"
                    onClick={() => openLogProfile(row, 'daily')}
                  >
                    <td><CopyableRef value={row.reference_no || row.id} /></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>{row.formatted_date || row.entry_date}</span>
                        {row.overdue_time && row.overdue_time !== 'same day' && (
                          <span style={{ 
                            alignSelf: 'flex-start',
                            backgroundColor: '#fee2e2', 
                            color: '#dc2626', 
                            fontSize: '9px', 
                            fontWeight: 'bold', 
                            padding: '1px 4px', 
                            borderRadius: '3px', 
                            border: '0.5px solid #fca5a5',
                            marginTop: '2px',
                            whiteSpace: 'nowrap'
                          }}>
                            ⚠️ Late ({row.overdue_time})
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{row.client_name}</td>
                    <td>{row.chamber_name}</td>
                    <td>{row.chamber_temp}°C</td>
                    {renderViewCell(row, 'daily')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination()}
        </>
      );
    }

    if (logTab === 'inward') {
      if (inwardLogs.length === 0) {
        return renderEmpty('No inward logs in your access scope.');
      }
      return (
        <>
          <div className="sub-admin-log-cards mobile-only">
            {inwardLogs.map((row) => renderMobileCard(row, 'inward'))}
          </div>
          <div className="sub-admin-simple-table-wrap desktop-only">
            <table className="sub-admin-simple-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Vehicle</th>
                  <th>Temp</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {inwardLogs.map((row) => (
                  <tr
                    key={row.inward_id}
                    className="sub-admin-log-row"
                    onClick={() => openLogProfile(row, 'inward')}
                  >
                    <td><CopyableRef value={row.reference_no || row.inward_id} /></td>
                    <td>{row.inward_entry_date}</td>
                    <td>{row.inward_client_name}</td>
                    <td>{row.inward_vehicle_no}</td>
                    <td>{row.inward_vehicle_temp ?? '—'}°C</td>
                    {renderViewCell(row, 'inward')}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination()}
        </>
      );
    }

    if (outwardLogs.length === 0) {
      return renderEmpty('No outward logs in your access scope.');
    }
    return (
      <>
        <div className="sub-admin-log-cards mobile-only">
          {outwardLogs.map((row) => renderMobileCard(row, 'outward'))}
        </div>
        <div className="sub-admin-simple-table-wrap desktop-only">
          <table className="sub-admin-simple-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Date</th>
                <th>Client</th>
                <th>Vehicle</th>
                <th>Temp</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {outwardLogs.map((row) => (
                <tr
                  key={row.outward_id}
                  className="sub-admin-log-row"
                  onClick={() => openLogProfile(row, 'outward')}
                >
                  <td><CopyableRef value={row.reference_no || row.outward_id} /></td>
                  <td>{row.outward_entry_date}</td>
                  <td>{row.outward_client_name}</td>
                  <td>{row.outward_vehicle_no}</td>
                  <td>{row.outward_vehicle_temp ?? '—'}°C</td>
                  {renderViewCell(row, 'outward')}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderPagination()}
      </>
    );
  };

  return (
    <div className="app-container sub-admin-shell">
      <aside className="do-sidebar desktop-only sub-admin-do-sidebar">
        <div className="do-sidebar-top">
          <Logo />
          <nav aria-label="Activity navigation">{renderSidebarNav()}</nav>
        </div>
        <div className="secure-sidebar-bottom sub-admin-do-sidebar-bottom">
          <div className="secure-profile-badge">
            <div className="secure-avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div className="secure-user-info">
              <strong>{displayName}</strong>
              <span>{user?.email}</span>
            </div>
            <button type="button" className="secure-logout-btn" onClick={onLogout} title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <header className="sub-admin-mobile-header mobile-only">
        <div className="sub-admin-mobile-header-side sub-admin-mobile-header-left">
          <div className="secure-mobile-logo">
            <Logo compact />
          </div>
        </div>
        <div className="sub-admin-mobile-header-center">
          <span className="secure-role-tag">{pageTitle}</span>
        </div>
        <div className="sub-admin-mobile-header-side sub-admin-mobile-header-right">
          <button
            type="button"
            className={`mobile-hamburger-btn ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={22} color="#00a2e8" /> : <Menu size={22} color="#0f172a" />}
          </button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div
          className="mobile-backdrop-overlay mobile-only"
          onClick={() => setIsMobileMenuOpen(false)}
          role="presentation"
        />
      )}

      {isMobileMenuOpen && (
        <div className="mobile-right-drawer mobile-only">
          <div className="right-drawer-header">
            <div className="drawer-user-info">
              <div className="user-avatar-circle">
                <User size={16} color="#00a2e8" />
              </div>
              <div className="user-text">
                <strong>{displayName}</strong>
                <span>{user?.email}</span>
              </div>
            </div>
            <button type="button" className="right-drawer-close" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="right-drawer-section">Menu</div>
          <div className="clean-menu-list">
            {MENU.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`clean-menu-item ${activeMenu === id ? 'active' : ''}`}
                onClick={() => selectMenu(id)}
              >
                <div className="item-left">
                  <Icon size={18} className="item-icon" />
                  <span>{label}</span>
                </div>
                <ChevronRight size={16} className="item-arrow" />
              </button>
            ))}
            <button
              type="button"
              className="clean-menu-item"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onLogout();
              }}
              style={{ color: '#ef4444' }}
            >
              <div className="item-left">
                <LogOut size={18} className="item-icon" style={{ color: '#ef4444' }} />
                <span>Logout</span>
              </div>
              <ChevronRight size={16} className="item-arrow" />
            </button>
          </div>
        </div>
      )}

      <div className="sub-admin-main-panel">
        <header className="secure-header sub-admin-desktop-header desktop-only">
          <div className="secure-header-left">
            <div className="sub-admin-desktop-title-wrap">
              <h2>{pageTitle}</h2>
              <span className="secure-role-tag">Customer portal</span>
            </div>
          </div>
        </header>

        <main className={`secure-body-viewport sub-admin-body secure-admin-viewport${selectedDetailLog ? ' is-log-profile' : ''}`}>
          {canGoBack && !selectedDetailLog && activeMenu !== 'dashboard' ? (
            <div className="sub-admin-screen-back-bar mobile-only">
              <button
                type="button"
                className="sub-admin-screen-back-btn"
                onClick={handleCustomerBack}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            </div>
          ) : null}
          {selectedDetailLog ? (
            <Suspense
              fallback={
                <div className="page-lazy-loader" role="status" aria-live="polite" style={{ position: 'relative', minHeight: 240 }}>
                  <div className="page-lazy-loader-inner">
                    <span className="page-lazy-loader-spinner" aria-hidden="true" />
                    <span>Loading profile…</span>
                  </div>
                </div>
              }
            >
              <SubAdminLogProfileScreen
                log={selectedDetailLog}
                detailType={detailType}
                onBack={() => setSelectedDetailLog(null)}
              />
            </Suspense>
          ) : (
            <>
          {activeMenu === 'dashboard' && (
            <div className="sub-admin-home">
              <section className="sub-admin-home-hero">
                <p className="sub-admin-home-kicker">Customer portal</p>
                <h1>Hello, {displayName}</h1>
                <p>
                  View cold-storage temperature records assigned to your account.
                  Tap a card below to open logs.
                </p>
              </section>

              <section className="sub-admin-stat-grid" aria-label="Log counts">
                <button type="button" className="sub-admin-stat-card" onClick={() => openLogsTab('chamber')}>
                  <span className="sub-admin-stat-label">Chamber</span>
                  <strong className="sub-admin-stat-value">{scopeTotals.chamber}</strong>
                  <span className="sub-admin-stat-hint">Open chamber logs</span>
                </button>
                <button type="button" className="sub-admin-stat-card is-inward" onClick={() => openLogsTab('inward')}>
                  <span className="sub-admin-stat-label">Inward</span>
                  <strong className="sub-admin-stat-value">{scopeTotals.inward}</strong>
                  <span className="sub-admin-stat-hint">Open inward logs</span>
                </button>
                <button type="button" className="sub-admin-stat-card is-outward" onClick={() => openLogsTab('outward')}>
                  <span className="sub-admin-stat-label">Outward</span>
                  <strong className="sub-admin-stat-value">{scopeTotals.outward}</strong>
                  <span className="sub-admin-stat-hint">Open outward logs</span>
                </button>
              </section>

              <section className="sub-admin-scope-panel" aria-label="Your access">
                <header className="sub-admin-scope-header">
                  <div className="sub-admin-scope-header-icon" aria-hidden="true">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="sub-admin-scope-header-text">
                    <h2>Your access</h2>
                    <p>Accounts and locations visible on this portal</p>
                  </div>
                </header>

                <div className="sub-admin-scope-grid">
                  <div className="sub-admin-scope-card">
                    <div className="sub-admin-scope-card-top">
                      <span className="sub-admin-scope-card-icon is-clients" aria-hidden="true">
                        <Building2 size={16} />
                      </span>
                      <div className="sub-admin-scope-card-meta">
                        <span className="sub-admin-scope-title">Clients</span>
                        <span className="sub-admin-scope-count">
                          {allowedClients.length === 0 ? 'Full access' : `${allowedClients.length} assigned`}
                        </span>
                      </div>
                    </div>
                    <div className="sub-admin-scope-list">
                      {allowedClients.length === 0 ? (
                        <p className="sub-admin-scope-text is-all">All clients</p>
                      ) : (
                        <p className="sub-admin-scope-text">{allowedClients.join(', ')}</p>
                      )}
                    </div>
                  </div>

                  <div className="sub-admin-scope-card">
                    <div className="sub-admin-scope-card-top">
                      <span className="sub-admin-scope-card-icon is-warehouses" aria-hidden="true">
                        <Warehouse size={16} />
                      </span>
                      <div className="sub-admin-scope-card-meta">
                        <span className="sub-admin-scope-title">Warehouses</span>
                        <span className="sub-admin-scope-count">
                          {allowedWarehouses.length === 0 ? 'Full access' : `${allowedWarehouses.length} assigned`}
                        </span>
                      </div>
                    </div>
                    <div className="sub-admin-scope-list">
                      {allowedWarehouses.length === 0 ? (
                        <p className="sub-admin-scope-text is-all">All warehouses</p>
                      ) : (
                        <p className="sub-admin-scope-text">{allowedWarehouses.join(', ')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <button type="button" className="sub-admin-primary-cta" onClick={() => selectMenu('temp_logs')}>
                Browse temperature logs
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {activeMenu === 'temp_logs' && (
            <div className="sub-admin-logs-panel">
              <div className="sub-admin-logs-intro">
                <h2>Temperature Logs</h2>
                <p>Search and open any record to see full details and photos.</p>
              </div>
              <div className="sub-admin-search-bar">
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="search"
                  placeholder="Search ref, client, vehicle…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  enterKeyHint="search"
                />
              </div>
              <div className="sub-admin-tab-row" role="tablist" aria-label="Log type">
                {[
                  { id: 'chamber', label: 'Chamber' },
                  { id: 'inward', label: 'Inward' },
                  { id: 'outward', label: 'Outward' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={logTab === tab.id}
                    className={`sub-admin-tab-btn ${logTab === tab.id ? 'active' : ''}`}
                    onClick={() => setLogTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {renderLogTable()}
            </div>
          )}

          {activeMenu === 'report' && (
            <div className="sub-admin-report-panel">
              <section className="sub-admin-report-hero">
                <p className="sub-admin-home-kicker">Support</p>
                <h1>Report an Issue</h1>
                <p>Tell us about a problem with a temperature log. We use your Reference No. to find the exact record.</p>
              </section>

              <section className="sub-admin-report-instructions" aria-label="How to report">
                <h2>Instructions</h2>
                <ol>
                  <li>
                    <strong>Mention the Reference No.</strong>
                    {' '}— Copy it from Temperature Logs (e.g. <code>RF-IN-26-0001</code>).
                  </li>
                  <li>
                    <strong>Type your issue</strong>
                    {' '}in the message box — what looks wrong, missing photo, wrong temp, etc.
                  </li>
                  <li>Tap <strong>Submit Report</strong>. Our team will review and follow up.</li>
                </ol>
              </section>

              <form className="sub-admin-report-form" onSubmit={handleSubmitReport} noValidate>
                <label className="sub-admin-report-field">
                  <span>Reference No. <em>*</em></span>
                  <input
                    type="text"
                    value={reportRefNo}
                    onChange={(e) => setReportRefNo(e.target.value)}
                    placeholder="e.g. RF-CH-26-0042"
                    autoComplete="off"
                    disabled={reportSubmitting}
                  />
                </label>

                <label className="sub-admin-report-field">
                  <span>Type your issue <em>*</em></span>
                  <textarea
                    value={reportMessage}
                    onChange={(e) => setReportMessage(e.target.value)}
                    placeholder="Describe the issue clearly…"
                    rows={3}
                    disabled={reportSubmitting}
                  />
                </label>

                {reportError ? <div className="sub-admin-report-alert is-error" role="alert">{reportError}</div> : null}
                {reportSuccess ? <div className="sub-admin-report-alert is-success" role="status">{reportSuccess}</div> : null}

                <button type="submit" className="sub-admin-primary-cta sub-admin-report-submit" disabled={reportSubmitting}>
                  {reportSubmitting ? (
                    <>
                      <Loader2 size={18} className="spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Submit Report
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
