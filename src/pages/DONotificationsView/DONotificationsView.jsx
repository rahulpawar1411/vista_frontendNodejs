import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  RefreshCw,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { fetchPermissionRequests, markPermissionRequestComplete } from '../../services/api';
import './DONotificationsView.css';

/**
 * WHAT: Lists Super Admin approve/deny results for edit/delete permission requests.
 * WHY: DO must know when they can edit a locked log and mark notifications done.
 * HOW: Polls permission-requests API; PATCH complete when DO finishes the approved edit.
 */
export default function DONotificationsView({ setActiveDOMenu }) {
  const [notifications, setNotifications] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(() => {
    const saved = localStorage.getItem('do_notifications_filter');
    return ['All', 'Approved', 'Denied', 'Pending', 'Completed'].includes(saved) ? saved : 'All';
  });
  const [completingId, setCompletingId] = useState(null);
  const [completingKind, setCompletingKind] = useState(null);
  const loadSeqRef = useRef(0);

  const loadNotifications = async ({ manual = false } = {}) => {
    const seq = ++loadSeqRef.current;
    if (manual) setRefreshing(true);
    setError('');
    try {
      const cacheBust = manual ? `?_=${Date.now()}` : '';
      const data = await fetchPermissionRequests(cacheBust);
      if (seq !== loadSeqRef.current) return;
      setNotifications(Array.isArray(data) ? data : []);
      window.dispatchEvent(new Event('do-notifications-changed'));
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      console.error('Failed to load notifications:', err);
      setError('Could not retrieve notifications. Please reload.');
    } finally {
      if (seq !== loadSeqRef.current) return;
      if (manual) setRefreshing(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    localStorage.setItem('do_notifications_filter', filter);
  }, [filter]);

  const parseRequestDescription = (descText) => {
    const info = { module: '-', client: '-', refNo: '', extra: '-' };
    if (!descText) return info;

    const parts = descText.split(' | ');
    if (descText.includes('Chamber')) info.module = 'Chamber Temp';
    else if (descText.includes('Inward')) info.module = 'Inward DO';
    else if (descText.includes('Outward')) info.module = 'Outward DO';

    const refMatch = descText.match(/\((?:Ref|ID):\s*([^\)]+)\)/i);
    if (refMatch) info.refNo = refMatch[1].trim();

    const clientPart = parts.find((p) => p.startsWith('Client:'));
    if (clientPart) info.client = clientPart.replace('Client:', '').trim();

    return info;
  };

  const formatAdminMessage = (desc, status, rawAction) => {
    if (!desc) return '—';

    const compact = desc.match(/^(\w+)\s+(approved|denied)\s·\s(.+)$/i);
    if (compact) {
      const action = compact[1];
      const outcome = compact[2].charAt(0).toUpperCase() + compact[2].slice(1).toLowerCase();
      return `${action} ${outcome} · ${compact[3].trim()}`;
    }

    const refMatch = desc.match(/\((?:Ref|ID):\s*([^\)]+)\)/i);
    const ref = refMatch ? refMatch[1].trim() : '';
    const isEdit = rawAction?.includes('EDIT') || /\bedit\b/i.test(desc);
    const actionLabel = isEdit ? 'Edit' : 'Delete';

    if (/Admin\s+\S+@/i.test(desc)) {
      if (/granted/i.test(desc) || status === 'Approved') {
        return ref ? `${actionLabel} approved · ${ref}` : `${actionLabel} approved`;
      }
      if (/denied/i.test(desc) || status === 'Denied') {
        return ref ? `${actionLabel} denied · ${ref}` : `${actionLabel} denied`;
      }
    }

    if (/Requested permission to/i.test(desc)) {
      return ref ? `${actionLabel} request · ${ref}` : desc.replace('Requested permission to ', '');
    }

    return desc.length > 48 ? `${desc.slice(0, 45)}…` : desc;
  };

  const isCompleted = (n) => Boolean(n.do_action_completed_at);

  const FILTER_TABS = ['All', 'Approved', 'Denied', 'Pending', 'Completed'];

  const activeNotifications = notifications.filter((n) => !isCompleted(n));
  const completedNotifications = notifications.filter((n) => isCompleted(n));

  const getTabCount = (tab) => {
    if (tab === 'Completed') return completedNotifications.length;
    if (tab === 'All') return activeNotifications.length;
    return activeNotifications.filter((n) => n.status === tab).length;
  };

  const displayedNotifications =
    filter === 'Completed'
      ? completedNotifications
      : activeNotifications.filter((notif) => filter === 'All' || notif.status === filter);

  const isCompletedTab = filter === 'Completed';

  const markNotificationDone = async (notif) => {
    setCompletingId(notif.id);
    setCompletingKind('done');
    try {
      const result = await markPermissionRequestComplete(notif.id);
      const completedAt = result.do_action_completed_at || new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id ? { ...n, do_action_completed_at: completedAt } : n
        )
      );
      setFilter('Completed');
      // Clear / refresh sidebar red-dot immediately after Done
      window.dispatchEvent(new Event('do-notifications-changed'));
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not mark notification as done.');
    } finally {
      setCompletingId(null);
      setCompletingKind(null);
    }
  };

  const handleProceed = (notif) => {
    if (setActiveDOMenu) setActiveDOMenu('History');
  };

  const formatTs = (val) =>
    new Date(val).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

  const renderTable = (rows, { showAction = true, showCompletedAt = false } = {}) => (
    <div className="notifications-table-responsive">
      <table className="logs-table">
        <thead>
          <tr>
            <th>Record ID</th>
            <th>Log Module</th>
            <th>Client Name</th>
            <th>Request Type</th>
            <th>Status</th>
            <th className="wrap-text">Message</th>
            <th>Timestamp</th>
            {showCompletedAt ? <th>Completed</th> : null}
            {showAction ? <th style={{ textAlign: 'center' }}>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((notif) => {
            const parsed = parseRequestDescription(notif.request_description || notif.description);
            const isEdit =
              notif.raw_action?.includes('EDIT') || notif.description?.toLowerCase().includes('edit');

            let statusColor = '#ca8a04';
            let statusBg = '#fef9c3';
            if (notif.status === 'Approved') {
              statusColor = '#16a34a';
              statusBg = '#dcfce7';
            } else if (notif.status === 'Denied') {
              statusColor = '#dc2626';
              statusBg = '#fee2e2';
            }

            return (
              <tr key={notif.id}>
                <td
                  style={{
                    fontWeight: '700',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                  title="Click to copy Reference ID"
                  onClick={() => {
                    const displayRef = parsed.refNo || `#${notif.record_id}`;
                    navigator.clipboard.writeText(displayRef);
                    alert(`Copied Reference ID: ${displayRef}`);
                  }}
                >
                  {parsed.refNo || `#${notif.record_id}`}
                </td>
                <td>
                  <span
                    className="status-badge"
                    style={{
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '0.66rem'
                    }}
                  >
                    {parsed.module}
                  </span>
                </td>
                <td style={{ fontWeight: '800', color: '#0f172a' }}>{parsed.client}</td>
                <td>
                  <span
                    className="status-badge"
                    style={{
                      backgroundColor: isEdit ? '#e0f2fe' : '#fee2e2',
                      color: isEdit ? '#0369a1' : '#dc2626',
                      fontWeight: 800,
                      fontSize: '0.66rem'
                    }}
                  >
                    {isEdit ? 'EDIT' : 'DELETE'}
                  </span>
                </td>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '100px',
                      fontSize: '0.64rem',
                      fontWeight: '800',
                      color: statusColor,
                      backgroundColor: statusBg
                    }}
                  >
                    {notif.status}
                  </span>
                </td>
                <td className="wrap-text" style={{ color: '#334155' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal'
                    }}
                  >
                    {formatAdminMessage(notif.description, notif.status, notif.raw_action)}
                  </div>
                </td>
                <td style={{ color: '#64748b', fontSize: '0.72rem' }}>
                  {formatTs(notif.created_at)}
                </td>
                {showCompletedAt ? (
                  <td style={{ color: '#64748b', fontSize: '0.72rem' }}>
                    {formatTs(notif.do_action_completed_at)}
                  </td>
                ) : null}
                {showAction ? (
                  <td style={{ textAlign: 'center' }}>
                    {notif.status === 'Approved' ? (
                      <div className="do-notifications-action-group">
                        <button
                          type="button"
                          disabled={completingId === notif.id}
                          onClick={() => handleProceed(notif)}
                          className="do-notifications-proceed-btn"
                        >
                          <span>Proceed</span>
                          <ArrowRight size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={completingId === notif.id}
                          onClick={() => markNotificationDone(notif)}
                          className="do-notifications-done-btn"
                        >
                          {completingId === notif.id && completingKind === 'done' ? '…' : 'Done'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="temp-monitor-page do-notifications-page">
      <div className="do-header-banner">
        <div className="do-header-left">
          <h2>
            <Bell size={26} color="#00a2e8" />
            <span>Permission & Access Notifications</span>
          </h2>
          <p>Proceed opens History to edit. Done marks the notification completed.</p>
        </div>

        <button
          type="button"
          onClick={() => loadNotifications({ manual: true })}
          disabled={refreshing}
          className="do-notifications-refresh-btn"
          aria-busy={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'do-notifications-spin' : ''} />
          <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      <div className="notifications-filter-container">
        {FILTER_TABS.map((tab) => {
          const count = getTabCount(tab);
          const isCompletedFilter = tab === 'Completed';

          let tabBorder = 'var(--border)';
          let tabBg = '#ffffff';
          let tabColor = 'var(--text-dark)';
          if (filter === tab) {
            if (isCompletedFilter) {
              tabBorder = '#64748b';
              tabBg = '#f1f5f9';
              tabColor = '#334155';
            } else {
              tabBorder = 'var(--primary)';
              tabBg = 'var(--primary-light)';
              tabColor = 'var(--primary)';
            }
          }

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={isCompletedFilter ? 'notifications-tab-completed' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${tabBorder}`,
                backgroundColor: tabBg,
                color: tabColor,
                fontSize: '0.78rem',
                fontWeight: '800',
                cursor: 'pointer'
              }}
            >
              <span>{tab}</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '100px',
                  backgroundColor:
                    filter === tab
                      ? isCompletedFilter
                        ? '#64748b'
                        : 'var(--primary)'
                      : '#f1f5f9',
                  color: filter === tab ? '#ffffff' : '#475569',
                  fontWeight: 'bold'
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="do-notifications-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="notifications-table-card">
        {initialLoading ? (
          <div className="notifications-empty">Loading notifications…</div>
        ) : displayedNotifications.length === 0 ? (
          <div className="notifications-empty">
            <Bell size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
            <p>
              {isCompletedTab
                ? 'No completed notifications yet. Proceed on an approved request to move it here.'
                : 'No notifications in this filter.'}
            </p>
          </div>
        ) : (
          renderTable(displayedNotifications, {
            showAction: !isCompletedTab,
            showCompletedAt: isCompletedTab
          })
        )}
      </div>
    </div>
  );
}
