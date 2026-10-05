/**
 * WHAT: Helpers to score DO daily inspection tasks (Morning/Evening per client assignment).
 * WHY: Super Admin dashboard shows completed, pending, and overdue chamber readings.
 * HOW: Match logs to assignments by date, shift, client, and chamber; count gaps.
 */

/** WHAT: YYYY-MM-DD for a Date in local timezone. WHY/HOW: Consistent date keys across task math. */
export const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** WHAT: Normalized date string from a log row (handles DD-MM-YYYY or ISO). WHY/HOW: Used to match tasks to calendar days. */
export const logDateKey = (log) => {
  const raw = log?.formatted_date ?? log?.entry_date ?? log?.date ?? '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return localDateStr(raw);
  }
  const s = String(raw).trim();
  if (!s) return '';
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return localDateStr(parsed);
  return s.slice(0, 10);
};

/** WHAT: Morning or Evening for a chamber log. WHY/HOW: Reads shift field or infers from inspection_time. */
export const resolveLogShift = (log) => {
  const s = String(log?.shift || '').trim();
  if (/^morning$/i.test(s)) return 'Morning';
  if (/^evening$/i.test(s)) return 'Evening';
  const t = String(log?.inspection_time || '').trim();
  if (!t) return 'Morning';
  if (t.startsWith('10:00') || t === '10:00 AM' || /^10:/.test(t)) return 'Morning';
  if (t.startsWith('16:00') || t.startsWith('18:00') || t.includes('04:00 PM') || t.includes('4:00 PM')) {
    return 'Evening';
  }
  if (/PM/i.test(t) && !/10:00/i.test(t)) return 'Evening';
  if (/AM/i.test(t)) return 'Morning';
  const hm = t.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return parseInt(hm[1], 10) < 14 ? 'Morning' : 'Evening';
  return 'Morning';
};

const namesMatch = (a, b) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * WHAT: Extracts chamber number from names like "Chamber 3".
 * WHY: Assignments and logs may reference by number instead of database id.
 * HOW: Regex ^Chamber\s+(\d+)$ only — custom names return null.
 */
export const chamberNumberFromName = (name) => {
  const m = String(name || '').match(/^Chamber\s+(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
};

/**
 * WHAT: Chamber rows shown for one DO (from assignments + warehouse-owned chambers).
 * WHY: Task UI must not show chambers the operator does not use.
 * HOW: Merges assignment chamber_ids with warehouse_name match; sorts by chamber number.
 */
export function getOperatorDisplayChambers(allChambers, mappings, chamberLimit, warehouseName = '') {
  const limit = Number(chamberLimit) || 4;
  const rows = Array.isArray(allChambers) ? allChambers : [];
  const byId = new Map(
    rows
      .filter((row) => Number.isFinite(Number(row?.id)))
      .map((row) => [Number(row.id), row])
  );
  const warehouseKey = String(warehouseName || '').trim().toLowerCase();

  const picked = [];
  const seen = new Set();

  const pushRow = (row) => {
    if (!row) return;
    const id = Number(row.id);
    if (!Number.isFinite(id) || seen.has(id)) return;
    const num = chamberNumberFromName(row.name || row.chamber_name);
    if (num != null && num > limit) return;
    picked.push(row);
    seen.add(id);
  };

  (mappings || []).forEach((assignment) => {
    const id = Number(assignment?.chamber_id);
    if (Number.isFinite(id) && byId.has(id)) {
      pushRow(byId.get(id));
      return;
    }
    const assignName = String(assignment?.chamber_name || '').trim();
    if (!assignName) return;
    const fromList = rows.find((c) => namesMatch(c.name || c.chamber_name, assignName));
    pushRow(fromList);
  });

  // Include warehouse-owned chambers even before clients are assigned
  if (warehouseKey) {
    rows.forEach((row) => {
      const wh = String(row.warehouse_name || '').trim().toLowerCase();
      if (wh && wh === warehouseKey) pushRow(row);
    });
  }

  picked.sort((a, b) => {
    const na = chamberNumberFromName(a.name || a.chamber_name);
    const nb = chamberNumberFromName(b.name || b.chamber_name);
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return String(a.name || a.chamber_name || '').localeCompare(String(b.name || b.chamber_name || ''));
  });

  return picked.map((row) => {
    const name = row.name || row.chamber_name || `Chamber ${row.id}`;
    const num = chamberNumberFromName(name);
    return {
      id: row.id,
      name,
      chamber_type: row.chamber_type || row.chamberType || 'Frozen',
      chamberNum: num,
      slotKey: num != null ? `num-${num}` : `id-${row.id}`
    };
  });
}

/** WHAT: True if assignment row refers to the same chamber as display chamber object. WHY/HOW: Matches by id or chamber number/name. */
export function assignmentMatchesDisplayChamber(assignment, chamber) {
  if (!assignment || !chamber) return false;
  if (Number(assignment.chamber_id) === Number(chamber.id)) return true;
  const assignNum = chamberNumberFromName(assignment.chamber_name);
  if (assignNum != null && chamber.chamberNum != null && assignNum === chamber.chamberNum) {
    return true;
  }
  return namesMatch(assignment.chamber_name, chamber.name);
}

const assignmentChamberNum = (assignment) => {
  const fromName = chamberNumberFromName(assignment?.chamber_name);
  if (fromName != null) return fromName;
  const id = Number(assignment?.chamber_id);
  return Number.isFinite(id) ? id : null;
};

/** WHAT: True when a chamber log belongs to an assignment (client + chamber). WHY/HOW: Used when finding task completion. */
export const logMatchesAssignment = (log, assignment) => {
  if (!log || !assignment) return false;
  if (!namesMatch(log.client_name, assignment.client_name)) return false;

  if (
    assignment.chamber_id != null &&
    log.chamber_id != null &&
    Number(log.chamber_id) === Number(assignment.chamber_id)
  ) {
    return true;
  }

  if (assignment.chamber_name && log.chamber_name && namesMatch(assignment.chamber_name, log.chamber_name)) {
    return true;
  }

  const assignNum = assignmentChamberNum(assignment);
  const logNum =
    chamberNumberFromName(log.chamber_name) ??
    (Number.isFinite(Number(log.chamber_id)) ? Number(log.chamber_id) : null);
  if (assignNum != null && logNum != null && assignNum === logNum) {
    return true;
  }

  return false;
};

/** WHAT: List of YYYY-MM-DD strings for each day in inclusive range. WHY/HOW: Builds expected task slots per day. */
export function enumerateDateKeys(fromDate, toDate) {
  const out = [];
  const from = new Date(`${fromDate}T12:00:00`);
  const to = new Date(`${toDate}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return out;
  const cur = new Date(from);
  while (cur <= to) {
    out.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * WHAT: Active client–chamber assignment rows for one operator (deduped).
 * WHY: Task counts only apply to clients currently assigned in their warehouse.
 * HOW: Skips inactive rows and chambers above chamberLimit.
 */
export function getActiveOperatorAssignments(mappings, chamberLimit) {
  const limit = Number(chamberLimit) || 4;
  const seen = new Set();
  const out = [];
  (mappings || []).forEach((row) => {
    if (!row || String(row.status || 'active').trim().toLowerCase() === 'inactive') return;
    const num = assignmentChamberNum(row);
    if (num != null && num > limit) return;
    const key = `${num ?? row.chamber_id ?? ''}|${String(row.client_name || '').trim().toLowerCase()}`;
    if (!String(row.client_name || '').trim() || seen.has(key)) return;
    seen.add(key);
    out.push({
      ...row,
      chamber_name: row.chamber_name || (num != null ? `Chamber ${num}` : row.chamber_name)
    });
  });
  return out;
}

/** WHAT: Default from/to dates for operator task widget (last N days). WHY/HOW: Ends today; starts days-1 ago. */
export function getDefaultOpTaskRange(days = 7) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (Math.max(1, days) - 1));
  return { fromDate: localDateStr(from), toDate: localDateStr(to) };
};

/** WHAT: First log that satisfies date, assignment, and shift. WHY/HOW: Marks one task slot as completed. */
export function findMatchingTaskLog(logs, assignment, dateKey, shift) {
  return (logs || []).find(
    (l) =>
      logDateKey(l) === dateKey &&
      logMatchesAssignment(l, assignment) &&
      resolveLogShift(l) === shift
  );
}

/**
 * WHAT: Summary counts and list of task items (completed/pending/overdue) for a date range.
 * WHY: Super Admin DO profile and dashboard show compliance at a glance.
 * HOW: For each day × assignment × Morning/Evening, find log or mark missing/overdue.
 */
export function computeDoTaskStatus({
  assignments,
  logs,
  fromDate,
  toDate,
  today = localDateStr()
}) {
  if (!fromDate || !toDate) {
    return {
      completed: 0,
      pending: 0,
      overdue: 0,
      total: 0,
      statusLabel: 'Select date range',
      statusTone: 'muted',
      items: [],
      todayPending: 0,
      assignmentCount: assignments?.length || 0
    };
  }

  const dates = enumerateDateKeys(fromDate, toDate);
  const items = [];
  let completed = 0;
  let pending = 0;
  let overdue = 0;

  dates.forEach((dateKey) => {
    if (dateKey > today) return;

    (assignments || []).forEach((assignment) => {
      ['Morning', 'Evening'].forEach((shift) => {
        const log = findMatchingTaskLog(logs, assignment, dateKey, shift);

        let status;
        if (log) {
          status = 'completed';
          completed += 1;
        } else if (dateKey < today) {
          status = 'overdue';
          overdue += 1;
        } else {
          status = 'pending';
          pending += 1;
        }

        items.push({
          date: dateKey,
          shift,
          chamber_name: assignment.chamber_name || `Chamber ${assignment.chamber_id ?? '—'}`,
          client_name: assignment.client_name,
          status,
          reference_no: log?.reference_no || null,
          log: log || null,
          logId: log?.id ?? null
        });
      });
    });
  });

  const todayPending = items.filter((i) => i.date === today && i.status === 'pending').length;
  const hasOverdue = overdue > 0;

  let statusLabel = 'On track';
  let statusTone = 'good';
  if (!assignments?.length) {
    statusLabel = 'No active clients';
    statusTone = 'muted';
  } else if (hasOverdue && todayPending > 0) {
    statusLabel = 'Overdue & pending';
    statusTone = 'mixed';
  } else if (hasOverdue) {
    statusLabel = 'Overdue tasks';
    statusTone = 'bad';
  } else if (todayPending > 0) {
    statusLabel = 'Pending today';
    statusTone = 'warn';
  }

  return {
    completed,
    pending,
    overdue,
    total: items.length,
    statusLabel,
    statusTone,
    items,
    todayPending,
    assignmentCount: assignments?.length || 0
  };
}
