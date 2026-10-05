// ====================================================================
// Login Page Component (src/pages/Login/Login.jsx)
// Paired with: src/pages/Login/Login.css
// Renders secure login portal for Super Admin, Customer, and DO Operator.
// ====================================================================

import React, { useState, useEffect } from 'react';
import { Lock, Mail, ShieldAlert, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Logo from '../../components/Logo/Logo';
import { API_BASE_URL, setAuthToken, fetchHealthSnapshot } from '../../services/api';
import './Login.css';

/**
 * WHAT: Email/password login form for the web portal (Super Admin focus).
 * WHY: Protected API routes need a session before any admin screen loads.
 * HOW: POST /auth/login, save token and user, reject mobile-only roles with a clear message.
 */
export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchHealthSnapshot().then((snap) => {
      if (!cancelled) setHealth(snap);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      // Send login credentials with HTTP credentials option enabled
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password
        })
      });

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        setErrorMsg(
          response.status >= 500
            ? 'Server error during login. Check backend is running on port 5000.'
            : 'Login failed: unexpected server response.'
        );
        return;
      }

      if (response.ok && data.success) {
        const sessionUser = data.user;
        const role = sessionUser?.role;

        // Mobile-only roles cannot use the web portal
        if (role === 'sub_admin' || role === 'do_operator' || role === 'customer') {
          setErrorMsg(
            role === 'sub_admin'
              ? 'Sub-Admin accounts use the mobile app only.'
              : role === 'customer'
                ? 'Customer accounts use the mobile app only.'
                : 'Data Operator accounts use the mobile app only.'
          );
          return;
        }

        if (role !== 'super_admin') {
          setErrorMsg('Access Denied: Invalid account role for this portal.');
          return;
        }

        // Fresh token first — prevents stale cookie from kicking the session out
        if (data.token) setAuthToken(data.token);
        localStorage.setItem('user', JSON.stringify(sessionUser));

        if (onLoginSuccess) {
          onLoginSuccess(sessionUser);
        }
        window.history.replaceState({}, '', '/admin');
      } else if (data.locked || response.status === 429) {
        setErrorMsg(data.message || 'Account temporarily locked after too many failed attempts.');
      } else {
        setErrorMsg(data.message || data.error || 'Login failed. Please verify your email and password.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg('Network error: Unable to connect to authorization server. Is backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-viewport-wrapper">
      <div className="login-glass-card">
        {/* Brand Header */}
        <div className="login-brand-header">
          <Logo compact={false} />
          <div className="login-vista-block">
            <p className="login-vista-name">VISTA</p>
            <p className="login-vista-line">
              Visibility · Inspection · Stock · Trust · Audit
            </p>
            <p className="login-subtitle">ReeferON Cold Chain Platform</p>
          </div>
        </div>

        {errorMsg && (
          <div className="login-error-banner">
            <ShieldAlert size={16} className="error-icon" />
            <span>{errorMsg}</span>
          </div>
        )}



        {/* Credentials Form */}
        <form className="login-form-block" onSubmit={handleSubmit}>
          {/* Email input */}
          <div className="login-input-group">
            <label>Email Address</label>
            <div className="input-field-icon-wrapper">
              <Mail size={16} className="field-icon" />
              <input
                type="email"
                placeholder="e.g. customer@reeferon.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Password input */}
          <div className="login-input-group">
            <label>Password</label>
            <div className="input-field-icon-wrapper">
              <Lock size={16} className="field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="login-password-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="login-password-eye-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide Password' : 'Show Password'}
                aria-label={showPassword ? 'Hide Password' : 'Show Password'}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="login-submit-btn do_operator"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="login-spinner" />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                <span>Enter Portal</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className={`login-env-status ${health?.ok ? 'is-ok' : health ? 'is-bad' : 'is-wait'}`}>
          <p>
            <strong>Frontend:</strong> {health?.frontendOrigin || window.location.origin}
          </p>
          <p>
            <strong>Backend:</strong>{' '}
            {health
              ? `${health.deployedOn || health.mode} · ${health.api}`
              : API_BASE_URL}
          </p>
          <p>
            <strong>Database:</strong>{' '}
            {health
              ? health.databaseConnected
                ? `connected · ${health.dbHost}${health.dbName ? ` / ${health.dbName}` : ''} (${health.dbKind || 'db'})`
                : `NOT connected${health.databaseError ? ` · ${health.databaseError}` : ''}`
              : 'checking…'}
          </p>
          <p>
            <strong>Status:</strong> {health?.status || 'checking…'}
          </p>
        </div>
      </div>
    </div>
  );
}
