// ====================================================================
// Frontend API Service Layer (frontend/src/services/api.js)
// --------------------------------------------------------------------
// RULES FOR DEVELOPERS:
//   1) Mutations (POST/PUT/DELETE) MUST use assertOk() — never fake "Saved (local)"
//   2) Failed API = throw Error so UI can show alert / error banner
//   3) Successful save means MySQL actually stored the row (or clear server error)
//   4) VITE_API_BASE_URL defaults to '/api' (Vite proxy → backend :5000)
//
// assertOk(res, fallbackMsg):
//   - res.ok → parse JSON body (or {})
//   - !res.ok → throw Error with server message / fallback
// ====================================================================

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function apiHostLabel(base) {
  const raw = String(base || '').trim();
  if (!raw || raw === '/api' || /localhost|127\.0\.0\.1/.test(raw)) return 'LOCAL';
  if (/railway\.app/i.test(raw)) return 'PRODUCTION';
  if (/onrender\.com/i.test(raw)) return 'RENDER';
  if (/^https:\/\//i.test(raw)) return 'PRODUCTION';
  return 'CUSTOM';
}

export async function fetchHealthSnapshot() {
  const mode = apiHostLabel(API_BASE_URL);
  const api = String(API_BASE_URL).replace(/\/$/, '');
  const frontendOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const snapshot = {
    ok: false,
    mode,
    frontendOrigin,
    frontendUrl: frontendOrigin,
    api,
    status: 'Offline',
    databaseConnected: false,
    database: 'disconnected',
    dbHost: '',
    dbName: '',
    dbKind: '',
    deployedOn: '',
    backendHost: '',
    databaseError: null,
    message: ''
  };

  try {
    const res = await fetch(`${api}/health`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    const info = data.data || {};
    snapshot.ok = Boolean(res.ok && data.success);
    snapshot.status = info.status || (snapshot.ok ? 'Online' : 'Offline');
    snapshot.message = data.message || '';
    snapshot.deployedOn = /onrender\.com/i.test(api)
      ? 'RENDER'
      : /railway\.app/i.test(api)
        ? 'RAILWAY'
        : snapshot.mode;

    try {
      const dbRes = await fetch(`${api}/health/db`, { credentials: 'include' });
      const dbData = await dbRes.json().catch(() => ({}));
      const dbInfo = dbData.data || {};
      snapshot.database = dbInfo.database || 'disconnected';
      snapshot.databaseConnected = snapshot.database === 'connected';
      snapshot.databaseError = dbInfo.databaseError || null;
      snapshot.dbHost = dbInfo.dbHost || '';
      snapshot.dbName = dbInfo.dbName || '';
      snapshot.dbKind = dbInfo.dbKind || '';
    } catch (_) {
      snapshot.database = 'disconnected';
      snapshot.databaseConnected = false;
    }
    return snapshot;
  } catch (err) {
    snapshot.message = err?.message || 'Backend not reachable';
    snapshot.databaseError = snapshot.message;
    return snapshot;
  }
}

/** Browser console: frontend origin, backend deploy, DB host, connection. */
export async function logBackendConnection() {
  const snap = await fetchHealthSnapshot();
  const okStyle = 'background:#059669;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700';
  const badStyle = 'background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700';
  console.info(
    `%c[ReeferON] ${snap.ok ? 'OK' : 'NOT OK'} · ${snap.mode}%c`,
    snap.ok ? okStyle : badStyle,
    'color:#111;font-weight:600'
  );
  console.info('[ReeferON] Frontend:', snap.frontendOrigin);
  console.info('[ReeferON] Backend API:', snap.api);
  console.info(
    '[ReeferON] Backend deploy:',
    snap.deployedOn || '(unknown)',
    snap.backendHost ? `· ${snap.backendHost}` : ''
  );
  console.info(
    '[ReeferON] Database:',
    snap.databaseConnected ? 'connected' : 'NOT connected',
    snap.dbHost ? `· ${snap.dbHost}` : '',
    snap.dbName ? `/ ${snap.dbName}` : '',
    snap.dbKind ? `(${snap.dbKind})` : ''
  );
  if (snap.databaseError) {
    console.warn('[ReeferON] DB error:', snap.databaseError);
  }
  if (snap.status) {
    console.info('[ReeferON] Status:', snap.status, snap.message ? `· ${snap.message}` : '');
  }
  return snap;
}

const AUTH_TOKEN_KEY = 'auth_token';

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {
    /* ignore storage errors */
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('user');
  } catch (_) {
    /* ignore */
  }
}

/** Let the browser paint between heavy export/page loops. */
export const yieldToMain = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });

/** DD-MM-YYYY or YYYY-MM-DD → YYYY-MM-DD for API query params. */
export function toApiDateParam(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split('-');
  if (parts.length === 3 && parts[0].length <= 2 && parts[2].length === 4) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return trimmed;
}

export function normalizeLogListResponse(data) {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, limit: data.length, hasMore: false };
  }
  if (data && Array.isArray(data.items)) {
    return {
      items: data.items,
      total: Number(data.total) || data.items.length,
      page: Number(data.page) || 1,
      limit: Number(data.limit) || data.items.length,
      hasMore: Boolean(data.hasMore)
    };
  }
  return { items: [], total: 0, page: 1, limit: 0, hasMore: false };
}

/** Read API error body safely (proxy/HTML/text must not crash res.json()). */
async function readApiError(res, fallback) {
  const text = await res.text().catch(() => '');
  try {
    const data = text ? JSON.parse(text) : {};
    return data.error || data.message || fallback;
  } catch (_) {
    if (res.status === 401) return 'Session expired. Please log in again as Super Admin.';
    if (res.status === 403) return 'Access denied.';
    if (/an error occurred while trying to proxy/i.test(text)) {
      return 'Backend not reachable on port 5000. Start backend (npm start) and try again.';
    }
    if (/^an error occurred/i.test(text.trim())) {
      return 'Server timed out or failed (common on free deploy when email/DB is slow). Retry — account may already be created.';
    }
    if (res.status >= 500) return 'Server error. Please try again later.';
    if (text && text.length < 200) return text;
    return fallback;
  }
}

function buildLogListQuery(params = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.page != null) qs.set('page', String(params.page));
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.fromDate) qs.set('fromDate', params.fromDate);
  if (params.toDate) qs.set('toDate', params.toDate);
  if (params.warehouse && params.warehouse !== 'All') qs.set('warehouse', params.warehouse);
  if (params.action && params.action !== 'All') qs.set('action', params.action);
  if (params.category) qs.set('category', params.category);
  if (params.operatorEmail) qs.set('operatorEmail', params.operatorEmail);
  if (params.shift && params.shift !== 'All') qs.set('shift', params.shift);
  if (params.export) qs.set('export', '1');
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function fetchLogListEndpoint(path, params = {}) {
  const query = buildLogListQuery(params);
  const res = await fetch(`${API_BASE_URL}${path}${query}`);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Request failed (${res.status})`);
  }
  const data = await res.json();
  return normalizeLogListResponse(data);
}

/** Fetch every page for export (chunked, yields to UI). Supports AbortSignal via params.signal */
export async function fetchAllLogPages(path, params = {}, onProgress) {
  const pageLimit = params.limit ?? 500;
  const maxRows = params.maxRows ?? 100000;
  const signal = params.signal;
  let page = 1;
  const all = [];
  let total = 0;
  let warned = false;

  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('Export cancelled.');
  };

  for (;;) {
    throwIfAborted();
    const chunk = await fetchLogListEndpoint(path, {
      ...params,
      page,
      limit: pageLimit,
      export: true
    });
    throwIfAborted();
    if (page === 1) {
      total = chunk.total;
      if (total > maxRows) {
        throw new Error(
          `Export too large (${Number(total).toLocaleString()} rows). Maximum is ${maxRows.toLocaleString()} rows. Please narrow the date range or filters.`
        );
      }
      if (total >= 50000 && !warned) {
        const ok = window.confirm(
          `This export has about ${Number(total).toLocaleString()} rows and may take time.\n\nContinue?`
        );
        if (!ok) throw new Error('Export cancelled.');
        warned = true;
      }
    }
    all.push(...chunk.items);
    if (typeof onProgress === 'function') {
      onProgress({ loaded: all.length, total: total || chunk.total, page });
    }
    if (all.length >= maxRows) {
      all.length = maxRows;
      break;
    }
    if (!chunk.hasMore || chunk.items.length === 0) break;
    page += 1;
    await yieldToMain();
  }

  return { items: all, total: total || all.length };
}

export const fetchChamberLogsPage = (params) => fetchLogListEndpoint('/chamber-temp', params);
export const fetchInwardLogsPage = (params) => fetchLogListEndpoint('/inward-logs', params);
export const fetchOutwardLogsPage = (params) => fetchLogListEndpoint('/outward-logs', params);

export const fetchAllChamberLogs = (params, onProgress) =>
  fetchAllLogPages('/chamber-temp', params, onProgress);
export const fetchAllInwardLogs = (params, onProgress) =>
  fetchAllLogPages('/inward-logs', params, onProgress);
export const fetchAllOutwardLogs = (params, onProgress) =>
  fetchAllLogPages('/outward-logs', params, onProgress);

// Globally override fetch: cookies + Bearer token (cookie alone can fail on LAN IP / some browsers)
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const nextOptions = { ...options, credentials: 'include' };
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) {
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  nextOptions.headers = headers;
  try {
    const res = await originalFetch(url, nextOptions);
    const urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : '');

    // If unauthorized (401) and not a login request, clear storage and log out
    if (
      res.status === 401 &&
      !urlStr.includes('/auth/login') &&
      !urlStr.includes('/auth/verify-profile-access') &&
      !urlStr.includes('/permission-requests/check')
    ) {
      // Only force logout when a web session actually existed
      let hadSession = false;
      try {
        hadSession = Boolean(localStorage.getItem('user') || localStorage.getItem(AUTH_TOKEN_KEY));
      } catch (_) {
        hadSession = false;
      }
      if (hadSession) {
        console.warn('⚠️ Session expired (401). Logging out...');
        clearAuthSession();
        window.dispatchEvent(new Event('unauthorized-session-expired'));
      }
    }
    return res;
  } catch (err) {
    throw err;
  }
};

/**
 * Parse JSON on success; throw a user-readable Error on failure.
 * Use on every write path so the UI never thinks data was saved when it was not.
 *
 * @param {Response} res - fetch Response
 * @param {string} [fallback] - message if body has no error/message
 * @returns {Promise<object>}
 */
async function assertOk(res, fallback) {
  if (res.ok) {
    const text = await res.text().catch(() => '');
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      return {};
    }
  }
  const message = await readApiError(res, fallback || `Request failed (${res.status}).`);
  const err = new Error(message);
  err.status = res.status;
  throw err;
}

// ====================================================================
// 1. Daily Chamber Temperature Monitoring APIs
//    GET list / POST create / PUT update / DELETE — all hit MySQL via backend
// ====================================================================
export const fetchChamberLogs = async (search = '', options = {}) => {
  const params = {
    search: search || options.search || '',
    page: options.page ?? 1,
    limit: options.limit ?? (options.paginated ? 50 : 200),
    fromDate: options.fromDate,
    toDate: options.toDate,
    warehouse: options.warehouse,
    operatorEmail: options.operatorEmail,
    shift: options.shift
  };
  const result = await fetchChamberLogsPage(params);
  if (options.paginated) return result;
  return result.items;
};

export const addChamberLog = async (logData) => {
  let bodyData;
  let headers = {};

  if (logData instanceof FormData) {
    bodyData = logData;
  } else {
    bodyData = JSON.stringify(logData);
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}/chamber-temp`, {
    method: 'POST',
    headers,
    body: bodyData
  });
  return assertOk(res, 'Failed to save chamber log. Data was not stored.');
};

export const updateChamberLog = async (id, updateData) => {
  let bodyData;
  let headers = {};

  if (updateData instanceof FormData) {
    bodyData = updateData;
  } else {
    bodyData = JSON.stringify(updateData);
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}/chamber-temp/${id}`, {
    method: 'PUT',
    headers,
    body: bodyData
  });
  return assertOk(res, 'Failed to update chamber log.');
};

export const deleteChamberLog = async (id) => {
  const res = await fetch(`${API_BASE_URL}/chamber-temp/${id}`, { method: 'DELETE' });
  return assertOk(res, 'Failed to delete chamber log.');
};

// ====================================================================
// Inward DO Logs APIs
// ====================================================================
export const fetchInwardLogs = async (search = '', options = {}) => {
  const params = {
    search: search || options.search || '',
    page: options.page ?? 1,
    limit: options.limit ?? (options.paginated ? 50 : 200),
    fromDate: options.fromDate,
    toDate: options.toDate,
    warehouse: options.warehouse
  };
  const result = await fetchInwardLogsPage(params);
  if (options.paginated) return result;
  return result.items;
};

export const addInwardLog = async (formData) => {
  const res = await fetch(`${API_BASE_URL}/inward-logs`, {
    method: 'POST',
    body: formData
  });
  return assertOk(res, 'Failed to save inward log. Data was not stored.');
};

export const deleteInwardLog = async (id) => {
  const res = await fetch(`${API_BASE_URL}/inward-logs/${id}`, { method: 'DELETE' });
  return assertOk(res, 'Failed to delete inward log.');
};

export const updateInwardLog = async (id, formData) => {
  const res = await fetch(`${API_BASE_URL}/inward-logs/${id}`, {
    method: 'PUT',
    body: formData
  });
  return assertOk(res, 'Failed to update inward log.');
};

/** POD-only update — no admin edit permission required. */
export const updateInwardPodPhoto = async (id, file) => {
  const formData = new FormData();
  formData.append('inward_pod_photo', file, file.name || 'pod-photo.jpg');
  const res = await fetch(`${API_BASE_URL}/inward-logs/${id}/pod-photo`, {
    method: 'PUT',
    body: formData
  });
  return assertOk(res, `Failed to update POD photo (${res.status}).`);
};

export const updateOutwardPodPhoto = async (id, file) => {
  const formData = new FormData();
  formData.append('outward_pod_photo', file, file.name || 'pod-photo.jpg');
  const res = await fetch(`${API_BASE_URL}/outward-logs/${id}/pod-photo`, {
    method: 'PUT',
    body: formData
  });
  return assertOk(res, `Failed to update POD photo (${res.status}).`);
};

// ====================================================================
// Outward DO Logs APIs
// ====================================================================
export const fetchOutwardLogs = async (search = '', options = {}) => {
  const params = {
    search: search || options.search || '',
    page: options.page ?? 1,
    limit: options.limit ?? (options.paginated ? 50 : 200),
    fromDate: options.fromDate,
    toDate: options.toDate,
    warehouse: options.warehouse
  };
  const result = await fetchOutwardLogsPage(params);
  if (options.paginated) return result;
  return result.items;
};

export const addOutwardLog = async (formData) => {
  const res = await fetch(`${API_BASE_URL}/outward-logs`, {
    method: 'POST',
    body: formData
  });
  return assertOk(res, 'Failed to save outward log. Data was not stored.');
};

export const deleteOutwardLog = async (id) => {
  const res = await fetch(`${API_BASE_URL}/outward-logs/${id}`, { method: 'DELETE' });
  return assertOk(res, 'Failed to delete outward log.');
};

export const updateOutwardLog = async (id, formData) => {
  const res = await fetch(`${API_BASE_URL}/outward-logs/${id}`, {
    method: 'PUT',
    body: formData
  });
  return assertOk(res, 'Failed to update outward log.');
};

// ====================================================================
// 2. Legacy Inward & Outward DO Logs APIs
// ====================================================================
export const fetchTempLogs = async (type = 'All', search = '') => {
  const query = `?type=${encodeURIComponent(type)}&search=${encodeURIComponent(search)}`;
  const res = await fetch(`${API_BASE_URL}/temp-logs${query}`);
  return assertOk(res, 'Failed to fetch temperature logs.');
};

export const addTempLog = async (logData) => {
  const res = await fetch(`${API_BASE_URL}/temp-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logData)
  });
  return assertOk(res, 'Failed to save temperature log. Data was not stored.');
};

export const createTempLog = addTempLog;

export const deleteTempLog = async (id) => {
  const res = await fetch(`${API_BASE_URL}/temp-logs/${id}`, { method: 'DELETE' });
  return assertOk(res, 'Failed to delete temperature log.');
};

// ====================================================================
// 3. Sales Leads APIs
// ====================================================================
export const fetchLeads = async () => {
  const res = await fetch(`${API_BASE_URL}/leads`);
  return assertOk(res, 'Failed to fetch leads.');
};

export const addLead = async (leadData) => {
  const res = await fetch(`${API_BASE_URL}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(leadData)
  });
  return assertOk(res, 'Failed to save lead. Data was not stored.');
};

export const createLead = addLead;

export const updateLeadStatus = async (id, status) => {
  const res = await fetch(`${API_BASE_URL}/leads/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  return assertOk(res, 'Failed to update lead status.');
};

export const updateLead = async (id, data) => {
  if (typeof data === 'string') {
    return updateLeadStatus(id, data);
  }
  const res = await fetch(`${API_BASE_URL}/leads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return assertOk(res, 'Failed to update lead.');
};

export const deleteLead = async (id) => {
  const res = await fetch(`${API_BASE_URL}/leads/${id}`, { method: 'DELETE' });
  return assertOk(res, 'Failed to delete lead.');
};

// ====================================================================
// 4. Sales Dashboard Summary APIs
// ====================================================================
export const fetchDashboardStats = async () => {
  const res = await fetch(`${API_BASE_URL}/dashboard`);
  const data = await assertOk(res, 'Failed to fetch dashboard stats.');
  return data.stats || data;
};

/** DO chamber tasks for a day or date range: completed / pending / overdue + daily_series. */
export const fetchDoTaskOverview = async ({ date, fromDate, toDate } = {}) => {
  const queryParams = new URLSearchParams();
  const from = toApiDateParam(fromDate || date);
  const to = toApiDateParam(toDate || fromDate || date);
  if (from) queryParams.append('fromDate', from);
  if (to) queryParams.append('toDate', to);
  const qs = queryParams.toString();
  const res = await fetch(
    `${API_BASE_URL}/dashboard/do-task-overview${qs ? `?${qs}` : ''}`
  );
  return await assertOk(res, 'Failed to fetch DO daily task overview.');
};

/** One DO's inward/outward total + today counts (by operator email). */
export const fetchDoOperatorIoCounts = async (email) => {
  const q = String(email || '').trim();
  if (!q) {
    return {
      total_inward: 0,
      total_outward: 0,
      today_inward: 0,
      today_outward: 0
    };
  }
  const qs = new URLSearchParams({ email: q });
  const res = await fetch(`${API_BASE_URL}/dashboard/do-operator-io-counts?${qs.toString()}`);
  return await assertOk(res, 'Failed to fetch DO inward/outward counts.');
};

export const fetchInventoryReconciliation = async ({
  search,
  warehouse,
  client,
  view,
  offset = 0,
  limit = 50,
  page
} = {}) => {
  const queryParams = new URLSearchParams();
  if (search) queryParams.append('search', search);
  if (warehouse) queryParams.append('warehouse', warehouse);
  if (client) queryParams.append('client', client);
  if (view) queryParams.append('view', view);
  if (offset != null) queryParams.append('offset', String(offset));
  if (limit != null) queryParams.append('limit', String(limit));
  if (page != null) queryParams.append('page', String(page));

  const res = await fetch(`${API_BASE_URL}/dashboard/inventory-reconciliation?${queryParams.toString()}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch inventory reconciliation logs.');
  }
  const data = await res.json();
  return data.items || [];
};

export const fetchInventoryFilterOptions = async () => {
  const res = await fetch(`${API_BASE_URL}/dashboard/inventory-filter-options`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to fetch live warehouse/client filters.');
  }
  return await res.json();
};

// ====================================================================
// 5. Data Operator CRUD APIs (Super Admin only)
// ====================================================================
export const fetchOperators = async () => {
  const res = await fetch(`${API_BASE_URL}/do-operators`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch data operators.');
  }
  return await res.json();
};

/** Chamber master list (id, name, total_clients) */
export const fetchChambers = async () => {
  const res = await fetch(`${API_BASE_URL}/chambers`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to fetch chambers.');
  }
  const body = await res.json();
  return Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
};

/** Update chamber name and/or total_clients */
export const updateChamber = async (id, data) => {
  const res = await fetch(`${API_BASE_URL}/chambers/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to update chamber.'));
  }
  return await res.json();
};

/** Super Admin: create a chamber (optionally for a DO warehouse). */
export const createChamber = async (data) => {
  const res = await fetch(`${API_BASE_URL}/chambers`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to create chamber.'));
  }
  return await res.json();
};

/** Super Admin: delete a chamber from master (client mappings deactivated). */
export const deleteChamber = async (id, remark = '') => {
  const res = await fetch(`${API_BASE_URL}/chambers/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remark })
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to delete chamber.'));
  }
  return await res.json();
};

export const createOperator = async (data) => {
  const res = await fetch(`${API_BASE_URL}/do-operators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to create data operator.'));
  }
  return await res.json();
};

export const updateOperator = async (id, data) => {
  const res = await fetch(`${API_BASE_URL}/do-operators/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update data operator.');
  }
  return await res.json();
};

export const deleteOperator = async (id) => {
  const res = await fetch(`${API_BASE_URL}/do-operators/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete data operator.');
  }
  return await res.json();
};

// ====================================================================
// Customer CRUD APIs (Super Admin only; formerly Sub-Admin)
// ====================================================================
export const fetchSubAdmins = async () => {
  const res = await fetch(`${API_BASE_URL}/customers`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to fetch customers.'));
  }
  const data = await res.json().catch(() => []);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.customers)) return data.customers;
  return [];
};

export const createSubAdmin = async (data) => {
  const res = await fetch(`${API_BASE_URL}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to create customer.'));
  }
  return await res.json();
};

export const updateSubAdmin = async (id, data) => {
  const res = await fetch(`${API_BASE_URL}/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to update customer.'));
  }
  return await res.json();
};

export const deleteSubAdmin = async (id) => {
  const res = await fetch(`${API_BASE_URL}/customers/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to delete customer.'));
  }
  return await res.json();
};

// ====================================================================
// Mobile Sub-Admin CRUD (full app access — Super Admin only)
// ====================================================================
export const fetchAppSubAdmins = async () => {
  const res = await fetch(`${API_BASE_URL}/sub-admins`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to fetch Sub-Admins.'));
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const createAppSubAdmin = async (data) => {
  const res = await fetch(`${API_BASE_URL}/sub-admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to create Sub-Admin.'));
  }
  return await res.json();
};

export const updateAppSubAdmin = async (id, data) => {
  const res = await fetch(`${API_BASE_URL}/sub-admins/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to update Sub-Admin.'));
  }
  return await res.json();
};

export const deleteAppSubAdmin = async (id) => {
  const res = await fetch(`${API_BASE_URL}/sub-admins/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to delete Sub-Admin.'));
  }
  return await res.json();
};

export const fetchAccessScopeOptions = async () => {
  const res = await fetch(`${API_BASE_URL}/dashboard/access-options`);
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to fetch access scope options.'));
  }
  const data = await res.json().catch(() => ({}));
  return data && typeof data === 'object' ? data : {};
};

export const submitCustomerReport = async ({ reference_no, message }) => {
  const res = await fetch(`${API_BASE_URL}/customer-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference_no, message })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit report.');
  }
  return data;
};

export const fetchCustomerReports = async ({ status = 'All', search = '' } = {}) => {
  const qs = new URLSearchParams();
  if (status && status !== 'All') qs.set('status', status);
  if (search) qs.set('search', search);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/customer-reports${query}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch customer reports.');
  }
  return Array.isArray(data) ? data : [];
};

export const updateCustomerReportStatus = async (id, status) => {
  const res = await fetch(`${API_BASE_URL}/customer-reports/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update report status.');
  }
  return data;
};

export const deleteCustomerReport = async (id) => {
  const res = await fetch(`${API_BASE_URL}/customer-reports/${id}`, {
    method: 'DELETE'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to delete report.');
  }
  return data;
};

export const fetchCustomerNoteThreads = async () => {
  const res = await fetch(`${API_BASE_URL}/customer-notes/threads`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch note threads.');
  }
  return Array.isArray(data.items) ? data.items : [];
};

export const fetchCustomerNotes = async ({ customer_email = '', search = '' } = {}) => {
  const qs = new URLSearchParams();
  if (customer_email) qs.set('customer_email', customer_email);
  if (search) qs.set('search', search);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE_URL}/customer-notes${query}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch notes.');
  }
  return Array.isArray(data.items) ? data.items : [];
};

export const postCustomerNote = async ({ customer_email, message, broadcast = false } = {}) => {
  const res = await fetch(`${API_BASE_URL}/customer-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_email, message, broadcast })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send note.');
  }
  return data;
};

export const deleteCustomerNote = async (id) => {
  const res = await fetch(`${API_BASE_URL}/customer-notes/${id}`, {
    method: 'DELETE'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to delete note.');
  }
  return data;
};

/** Paginated activity / security / system logs. Returns { items, total, page, limit, hasMore }. */
export const fetchOperatorActivities = async (params = {}) => {
  return fetchLogListEndpoint('/operator-activities', params);
};

export const fetchAllOperatorActivities = (params = {}, onProgress) =>
  fetchAllLogPages('/operator-activities', params, onProgress);

// ====================================================================
// 6. Permission Requests APIs
// ====================================================================
export const checkEditPermission = async (recordType, recordId, action = 'Edit') => {
  const res = await fetch(`${API_BASE_URL}/permission-requests/check?record_type=${encodeURIComponent(recordType)}&record_id=${encodeURIComponent(recordId)}&action=${encodeURIComponent(action)}`);
  if (!res.ok) {
    throw new Error('Failed to check permission.');
  }
  return await res.json();
};

export const requestEditPermission = async (recordType, recordId, description, action = 'Edit') => {
  const res = await fetch(`${API_BASE_URL}/permission-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_type: recordType, record_id: recordId, description, action })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to request permission.');
  }
  return await res.json();
};

export const fetchPermissionRequests = async (cacheBustQuery = '') => {
  const suffix = cacheBustQuery.startsWith('?') ? cacheBustQuery : '';
  const res = await fetch(`${API_BASE_URL}/permission-requests${suffix}`);
  if (!res.ok) {
    throw new Error('Failed to fetch permission requests.');
  }
  return await res.json();
};

export const updatePermissionRequest = async (id, status, remark = '') => {
  const res = await fetch(`${API_BASE_URL}/permission-requests/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, remark: remark || undefined })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update permission request.');
  }
  return await res.json();
};

/** Super Allow / request / update trail for a History or Profile log record */
export const fetchRecordPermissionHistory = async (recordType, recordId) => {
  const qs = new URLSearchParams({
    record_type: String(recordType || ''),
    record_id: String(recordId || '')
  });
  const res = await fetch(`${API_BASE_URL}/permission-requests/record-history?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load approval history.');
  }
  return await res.json();
};

export const markPermissionRequestComplete = async (id) => {
  const res = await fetch(`${API_BASE_URL}/permission-requests/${id}/complete`, {
    method: 'PATCH'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to mark notification complete.');
  }
  return await res.json();
};

export const fetchSystemConfig = async () => {
  const res = await fetch(`${API_BASE_URL}/permission-requests/config`);
  if (!res.ok) {
    throw new Error('Failed to fetch permission config.');
  }
  return await res.json();
};

export const updateSystemConfig = async (configKey, configValue) => {
  const res = await fetch(`${API_BASE_URL}/permission-requests/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config_key: configKey, config_value: configValue })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update permission config.');
  }
  return await res.json();
};

export const changeSuperAdminPassword = async ({ currentPassword, newPassword, email }) => {
  const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword, email })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to update profile.');
  }
  return data;
};

export const verifySuperAdminProfileAccess = async ({ email, password }) => {
  const res = await fetch(`${API_BASE_URL}/auth/verify-profile-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Verification failed.');
  }
  return data;
};

// ====================================================================
// 7. Native Mobile Inspections APIs
// ====================================================================
export const fetchDailyInspections = async () => {
  const res = await fetch(`${API_BASE_URL}/chambers/inspections`);
  if (!res.ok) {
    throw new Error('Failed to fetch native daily inspections.');
  }
  const body = await res.json();
  return body.data || [];
};

export const deleteDailyInspection = async (id) => {
  const res = await fetch(`${API_BASE_URL}/chambers/inspections/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete inspection log.');
  }
  return await res.json();
};

export const fetchDailyInventoryDeltas = async ({ warehouse, fromDate, toDate } = {}) => {
  const queryParams = new URLSearchParams();
  if (warehouse) queryParams.append('warehouse', warehouse);
  if (fromDate) queryParams.append('fromDate', fromDate);
  if (toDate) queryParams.append('toDate', toDate);

  const res = await fetch(`${API_BASE_URL}/dashboard/daily-inventory-deltas?${queryParams.toString()}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch daily inventory comparisons.');
  }
  const data = await res.json();
  return data.items || [];
};

/** 1-month Excel-style daily sheet for one client lot (Morning/Evening/In/Out/Total). */
export const fetchClientMonthBoxSheet = async ({
  client,
  warehouse,
  chamber,
  fromDate,
  toDate
} = {}) => {
  const queryParams = new URLSearchParams();
  if (client) queryParams.append('client', client);
  if (warehouse) queryParams.append('warehouse', warehouse);
  if (chamber) queryParams.append('chamber', chamber);
  if (fromDate) queryParams.append('fromDate', fromDate);
  if (toDate) queryParams.append('toDate', toDate);

  const res = await fetch(
    `${API_BASE_URL}/dashboard/client-month-box-sheet?${queryParams.toString()}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to load client month sheet.');
  }
  return await res.json();
};

export const fetchChamberAssignments = async (warehouseName) => {
  const queryParams = new URLSearchParams();
  if (warehouseName) queryParams.append('warehouse_name', warehouseName);
  const res = await fetch(`${API_BASE_URL}/chambers/assignments?${queryParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch assignments.');
  }
  const data = await res.json();
  return data.data || [];
};

export const addChamberAssignment = async ({ chamber_id, client_name, remark, chamber_type, warehouse_name, operator_email }) => {
  const res = await fetch(`${API_BASE_URL}/chambers/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chamber_id, client_name, remark, chamber_type, warehouse_name, operator_email })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to add assignment.');
  }
  return await res.json();
};

export const deleteChamberAssignment = async ({ chamber_id, client_name, remark, warehouse_name, operator_email }) => {
  const res = await fetch(`${API_BASE_URL}/chambers/assignments`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chamber_id, client_name, remark, warehouse_name, operator_email })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to delete assignment.');
  }
  return await res.json();
};

export const fetchMasterWarehouses = async ({ q = '', activeOnly = true } = {}) => {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  qs.set('active_only', activeOnly ? '1' : '0');
  const res = await fetch(`${API_BASE_URL}/masters/warehouses?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch warehouses.');
  }
  return Array.isArray(data.data) ? data.data : [];
};

export const createMasterWarehouse = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/masters/warehouses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to create warehouse.');
  }
  return data;
};

export const updateMasterWarehouse = async (id, payload) => {
  const res = await fetch(`${API_BASE_URL}/masters/warehouses/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to update warehouse.');
  }
  return data;
};

export const fetchMasterClients = async ({ q = '', activeOnly = true, warehouse_code = '' } = {}) => {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  qs.set('active_only', activeOnly ? '1' : '0');
  if (warehouse_code) qs.set('warehouse_code', warehouse_code);
  const res = await fetch(`${API_BASE_URL}/masters/clients?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch clients.');
  }
  return Array.isArray(data.data) ? data.data : [];
};

export const createMasterClient = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/masters/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to create client.');
  }
  return data;
};

export const updateMasterClient = async (id, payload) => {
  const res = await fetch(`${API_BASE_URL}/masters/clients/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to update client.');
  }
  return data;
};

