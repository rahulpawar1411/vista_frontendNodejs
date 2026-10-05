// ====================================================================
// Main Application Root Component (src/App.jsx)
// Paired with: src/App.css
// Top Right Hamburger Mobile Menu Navigation & Logo Live Clock.
// Removed Bottom Menu navigation on mobile.
// ====================================================================

import React, { useState, useEffect, Suspense, lazy } from 'react';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import Login from './pages/Login/Login';
import Logo from './components/Logo/Logo';
import { API_BASE_URL, clearAuthSession, fetchPermissionRequests, logBackendConnection } from './services/api';
import './App.css';
import './styles/shell-layout.css';

const PortalEntry = lazy(() => import('./pages/PortalEntry/PortalEntry'));
const DOHeader = lazy(() => import('./components/DOHeader/DOHeader'));
const DOSidebar = lazy(() => import('./components/DOSidebar/DOSidebar'));
const TempMonitor = lazy(() => import('./pages/TempMonitor/TempMonitor'));
const InwardMonitor = lazy(() => import('./pages/InwardMonitor/InwardMonitor'));
const OutwardMonitor = lazy(() => import('./pages/OutwardMonitor/OutwardMonitor'));
const DOHistoryView = lazy(() => import('./pages/DOHistoryView/DOHistoryView'));
const DOProfileLookup = lazy(() => import('./pages/DOProfileLookup/DOProfileLookup'));
const DONotificationsView = lazy(() => import('./pages/DONotificationsView/DONotificationsView'));
const SuperAdminSecureWindow = lazy(() => import('./pages/SuperAdminSecureWindow/SuperAdminSecureWindow'));
const SubAdminSecureWindow = lazy(() => import('./pages/SubAdminSecureWindow/SubAdminSecureWindow'));

/**
 * WHAT: Spinner shown while a lazy-loaded page chunk is downloading.
 * WHY: Large admin screens are code-split; users need feedback during load.
 * HOW: Simple centered spinner with accessible "Loading…" text.
 */
function PageLoader() {
  return (
    <div className="page-lazy-loader" role="status" aria-live="polite">
      <div className="page-lazy-loader-inner">
        <span className="page-lazy-loader-spinner" aria-hidden="true" />
        <span>Loading…</span>
      </div>
    </div>
  );
}

/**
 * WHAT: Root app — login gate, role routing, and lazy-loaded main windows.
 * WHY: One entry decides who sees Super Admin vs portal vs mobile-only message.
 * HOW: Reads user from localStorage; super_admin gets SuperAdminSecureWindow; others blocked or login.
 */
export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('user')) || null;
      // Web is Super Admin only — clear mobile-role sessions from localStorage
      if (
        parsed?.role === 'sub_admin' ||
        parsed?.role === 'customer' ||
        parsed?.role === 'do_operator'
      ) {
        clearAuthSession();
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });

  const getWindowFromURL = () => {
    const role = user?.role;
    if (user && role === 'do_operator') return 'do_window';
    if (user && role === 'customer') return 'customer';
    const path = window.location.pathname.toLowerCase();
    if (path.includes('do-operator') || path.includes('/do')) return 'do_window';
    if (path.includes('/customer') || path.includes('sub-admin') || path.includes('subadmin')) return 'customer';
    if (path.includes('admin')) return 'super_admin';
    return 'portal_entry';
  };

  const [selectedWindow, setSelectedWindow] = useState(getWindowFromURL());
  const [activeDOMenu, setActiveDOMenu] = useState(() => {
    return localStorage.getItem('activeDOMenu') || 'All';
  });

  const [editInwardData, setEditInwardData] = useState(null);
  const [editOutwardData, setEditOutwardData] = useState(null);
  const [editDailyData, setEditDailyData] = useState(null);
  const [hasDoNotifAlert, setHasDoNotifAlert] = useState(false);

  useEffect(() => {
    const role = user?.role;
    if (user && role === 'do_operator' && selectedWindow !== 'do_window') {
      setSelectedWindow('do_window');
      window.history.pushState({}, '', '/do-operator');
    }
    if (user && role === 'customer' && selectedWindow !== 'customer') {
      setSelectedWindow('customer');
      window.history.pushState({}, '', '/customer');
    }
  }, [user, selectedWindow]);

  useEffect(() => {
    localStorage.setItem('activeDOMenu', activeDOMenu);
  }, [activeDOMenu]);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearAuthSession();
      setUser(null);
      setSelectedWindow('portal_entry');
      window.history.pushState({}, '', '/');
    };
    window.addEventListener('unauthorized-session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('unauthorized-session-expired', handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    logBackendConnection();
  }, []);

  // DO Notifications red-dot: only when at least one Super Admin APPROVAL is waiting (not Done yet)
  useEffect(() => {
    const isDo = user?.role === 'do_operator' && selectedWindow === 'do_window';
    if (!isDo) {
      setHasDoNotifAlert(false);
      return undefined;
    }

    let cancelled = false;

    const refreshNotifBadge = async () => {
      try {
        const data = await fetchPermissionRequests(`?_=${Date.now()}`);
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const hasOpenApproval = list.some((n) => {
          const isApproved =
            n.status === 'Approved' ||
            n.raw_action === 'GRANT_PERMISSION' ||
            n.raw_action === 'GRANT_DELETE';
          const stillOpen = !n.do_action_completed_at;
          return isApproved && stillOpen;
        });
        // Hide whenever there is zero open approval
        setHasDoNotifAlert(Boolean(hasOpenApproval));
      } catch {
        // On fetch failure, hide badge (do not keep a stale red dot)
        if (!cancelled) setHasDoNotifAlert(false);
      }
    };

    refreshNotifBadge();
    const intervalId = setInterval(refreshNotifBadge, 12000);
    const onFocus = () => refreshNotifBadge();
    const onNotifChanged = () => refreshNotifBadge();
    window.addEventListener('focus', onFocus);
    window.addEventListener('do-notifications-changed', onNotifChanged);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('do-notifications-changed', onNotifChanged);
    };
  }, [user?.role, selectedWindow, activeDOMenu]);

  const navigateToWindow = (win) => {
    const role = user?.role;
    if (user && role === 'do_operator' && win !== 'do_window') return;
    if (user && role === 'customer' && win !== 'customer') return;
    setSelectedWindow(win);
    let targetPath = '/';
    if (win === 'do_window') targetPath = '/do-operator';
    if (win === 'super_admin') targetPath = '/admin';
    if (win === 'customer') targetPath = '/customer';
    window.history.pushState({}, '', targetPath);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    clearAuthSession();
    setUser(null);
    setSelectedWindow('portal_entry');
    window.history.pushState({}, '', '/');
  };

  const handleUserUpdate = (updatedUser) => {
    if (!updatedUser) return;
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  useEffect(() => {
    const handlePopState = () => {
      setSelectedWindow(getWindowFromURL());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  const getDOTitle = () => {
    switch (activeDOMenu) {
      case 'Inward': return 'DO Inward Temp Monitor';
      case 'Outward': return 'DO Outward Temp Monitor';
      case 'History': return 'DO Temp Monitoring History';
      case 'Lookup': return 'DO Profile Lookup Portal';
      case 'Notifications': return 'DO Notifications';
      default: return 'DO Daily Temp Monitor';
    }
  };

  if (!user) {
    return (
      <ErrorBoundary>
        <Login onLoginSuccess={(u) => setUser(u)} />
      </ErrorBoundary>
    );
  }

  if (user.role === 'super_admin') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <SuperAdminSecureWindow user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  /*
  // Commented out Customer web window access
  if (user.role === 'customer' || user.role === 'sub_admin') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <SubAdminSecureWindow user={user} onLogout={handleLogout} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  */

  // Block mobile application roles (do_operator, customer) from accessing the web app views
  if (user.role === 'do_operator' || user.role === 'customer' || user.role === 'sub_admin') {
    return (
      <ErrorBoundary>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          textAlign: 'center',
          padding: '24px',
          fontFamily: 'system-ui'
        }}>
          <Logo />
          <h2 style={{ marginTop: '24px', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Mobile Access Required</h2>
          <p style={{ marginTop: '8px', color: '#475569', fontSize: '0.9rem', maxWidth: '400px', lineHeight: 1.5 }}>
            DO, Customer, and Sub-Admin accounts must log in using the ReeferON mobile app.
          </p>
          <button 
            onClick={handleLogout}
            style={{
              marginTop: '24px',
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Log Out
          </button>
        </div>
      </ErrorBoundary>
    );
  }

  if (selectedWindow === 'portal_entry') {
    if (user.role === 'do_operator') {
      setSelectedWindow('do_window');
      window.history.pushState({}, '', '/do-operator');
    } else {
      return (
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <PortalEntry onSelectWindow={(win) => navigateToWindow(win)} />
          </Suspense>
        </ErrorBoundary>
      );
    }
  }

  return (
    <ErrorBoundary>
      <div className="app-container">
        {/* Commented out Operator Web Shell Layout
        {selectedWindow === 'do_window' ? (
          <Suspense fallback={<PageLoader />}>
            <div className="do-window-shell">
              <DOSidebar
                user={user}
                activeDOMenu={activeDOMenu}
                setActiveDOMenu={setActiveDOMenu}
                onLogout={handleLogout}
                hasNotificationAlert={hasDoNotifAlert}
              />

              <DOHeader
                user={user}
                activeTitle={getDOTitle()}
                activeDOMenu={activeDOMenu}
                setActiveDOMenu={setActiveDOMenu}
                onLogout={handleLogout}
                hasNotificationAlert={hasDoNotifAlert}
              />

              <main className="app-viewport">
                {activeDOMenu === 'Inward' ? (
                  <InwardMonitor editData={editInwardData} setEditData={setEditInwardData} setActiveDOMenu={setActiveDOMenu} />
                ) : activeDOMenu === 'Outward' ? (
                  <OutwardMonitor editData={editOutwardData} setEditData={setEditOutwardData} setActiveDOMenu={setActiveDOMenu} />
                ) : activeDOMenu === 'History' ? (
                  <DOHistoryView
                    setActiveDOMenu={setActiveDOMenu}
                    setEditInwardData={setEditInwardData}
                    setEditOutwardData={setEditOutwardData}
                    setEditDailyData={setEditDailyData}
                  />
                ) : activeDOMenu === 'Lookup' ? (
                  <DOProfileLookup
                    setActiveDOMenu={setActiveDOMenu}
                    setEditInwardData={setEditInwardData}
                    setEditOutwardData={setEditOutwardData}
                    setEditDailyData={setEditDailyData}
                  />
                ) : activeDOMenu === 'Notifications' ? (
                  <DONotificationsView setActiveDOMenu={setActiveDOMenu} />
                ) : (
                  <TempMonitor
                    forcedMenu={activeDOMenu}
                    onMenuChange={setActiveDOMenu}
                    editData={editDailyData}
                    setEditData={setEditDailyData}
                  />
                )}
              </main>
            </div>
          </Suspense>
        ) : (
        */}
          <Suspense fallback={<PageLoader />}>
            <PortalEntry onSelectWindow={(win) => navigateToWindow(win)} />
          </Suspense>
        {/*
        )}
        */}
      </div>
    </ErrorBoundary>
  );
}
