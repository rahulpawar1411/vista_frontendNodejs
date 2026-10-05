// ====================================================================
// Shared CSV export helpers (all Export buttons)
// Progress label, date checks, row limits, safe download + errors
// ====================================================================

export const EXPORT_MAX_ROWS = 100000;
export const EXPORT_WARN_ROWS = 50000;

/** Normalize DD-MM-YYYY or YYYY-MM-DD → YYYY-MM-DD for comparisons. */
function normalizeExportDate(dateStr) {
  const trimmed = String(dateStr || '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split('-');
  if (parts.length === 3 && parts[0].length <= 2 && parts[2].length === 4) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return trimmed;
}

/** Require From + To dates before heavy log exports. Returns normalized { from, to }. */
export function requireExportDates(fromDate, toDate) {
  const from = normalizeExportDate(fromDate);
  const to = normalizeExportDate(toDate);
  if (!from || !to) {
    throw new Error('Please select From Date and To Date before exporting.');
  }
  if (from > to) {
    throw new Error('From Date cannot be after To Date.');
  }
  return { from, to };
}

/**
 * Empty / huge export guards.
 * Returns false if user cancels a large-export confirm.
 */
export function confirmExportSize(rowCount, { alreadyWarned = false } = {}) {
  const count = Number(rowCount) || 0;
  if (count <= 0) {
    throw new Error('No data available to export.');
  }
  if (count > EXPORT_MAX_ROWS) {
    throw new Error(
      `Export too large (${count.toLocaleString()} rows). Maximum is ${EXPORT_MAX_ROWS.toLocaleString()} rows. Please narrow the date range or filters.`
    );
  }
  if (!alreadyWarned && count >= EXPORT_WARN_ROWS) {
    return window.confirm(
      `This export has about ${count.toLocaleString()} rows and may take time or use more memory.\n\nContinue?`
    );
  }
  return true;
}

/** WHAT: Wraps one cell in quotes for CSV. WHY/HOW: Doubles internal quotes per Excel rules. */
export function escapeCsvCell(val) {
  return `"${String(val ?? '').replace(/"/g, '""')}"`;
}

/**
 * WHAT: done/expected text that Excel will not auto-convert to a date.
 * WHY: Values like 11/11 become Nov 11 in Excel unless forced as text.
 * HOW: Emits ="11/11" formula so the cell displays literally 11/11.
 */
export function excelRatioText(done, expected) {
  const d = Number(done) || 0;
  const e = Number(expected) || 0;
  if (e <= 0) return '—';
  return `="${d}/${e}"`;
}

/**
 * WHAT: Builds a full CSV string with UTF-8 BOM for Excel.
 * WHY: All export buttons share one format.
 * HOW: Header row plus escaped data rows via escapeCsvCell.
 */
export function buildCsv(headers, rowArrays) {
  let csv = '\uFEFF';
  csv += headers.map(escapeCsvCell).join(',') + '\n';
  (rowArrays || []).forEach((row) => {
    csv += (row || []).map(escapeCsvCell).join(',') + '\n';
  });
  return csv;
}

/**
 * WHAT: Triggers browser download of a CSV file.
 * WHY: Users expect a .csv file, not clipboard copy.
 * HOW: Blob + temporary <a download> click, then revokes object URL.
 */
export function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** WHAT: Same as escapeCsvCell (alias for toCsvContent). WHY/HOW: Keeps naming consistent in helpers. */
export function csvEscape(val) {
  return `"${String(val ?? '').replace(/"/g, '""')}"`;
}

/** Plain CSV Excel can open as a normal workbook (headers + data only). */
export function toCsvContent(headers = [], rows = []) {
  const lines = [headers.map(csvEscape).join(',')];
  (rows || []).forEach((row) => {
    lines.push((row || []).map(csvEscape).join(','));
  });
  return `\uFEFF${lines.join('\n')}\n`;
}

/**
 * WHAT: User-visible export status like "Exporting… 42%".
 * WHY: Large exports need progress in the button label.
 * HOW: Uses loaded/total from fetchAllLogPages onProgress callback.
 */
export function formatExportProgress(progress) {
  if (!progress) return 'Exporting…';
  const loaded = Number(progress.loaded) || 0;
  const total = Number(progress.total) || 0;
  if (total > 0) {
    const pct = Math.min(100, Math.round((loaded / total) * 100));
    return `Exporting… ${pct}%`;
  }
  if (loaded > 0) return `Exporting… ${loaded.toLocaleString()} rows`;
  return 'Exporting…';
}

/**
 * WHAT: Trims row list to EXPORT_MAX_ROWS and asks user to confirm huge exports.
 * WHY: Protects browser memory on accidental full-database export.
 * HOW: slice + confirmExportSize; throws if user cancels.
 */
export function finalizeExportRows(rows) {
  let list = Array.isArray(rows) ? rows : [];
  if (list.length > EXPORT_MAX_ROWS) {
    list = list.slice(0, EXPORT_MAX_ROWS);
  }
  if (!confirmExportSize(list.length)) {
    throw new Error('Export cancelled.');
  }
  return list;
}

/** WHAT: True when user clicked Cancel on export confirm. WHY/HOW: Suppresses error banner for voluntary cancel. */
export function isExportCancelled(err) {
  return String(err?.message || '') === 'Export cancelled.';
}

/** Timeout / network / fetch failures → retryable. */
export function isRetryableExportError(err) {
  if (!err || isExportCancelled(err)) return false;
  const name = String(err.name || '');
  const msg = String(err.message || '');
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (name === 'TypeError' && /fetch|network|load failed/i.test(msg)) return true;
  return /failed to fetch|networkerror|network request failed|timeout|timed out|aborted|load failed|econnreset|econnrefused|502|503|504|gateway|offline/i.test(
    msg
  );
}

/**
 * Clear user-facing export error text.
 * Returns null when cancelled (no banner).
 */
export function getExportErrorMessage(err) {
  if (!err || isExportCancelled(err)) return null;
  if (isRetryableExportError(err)) {
    return 'Export failed. Please try again.';
  }
  return err.message || 'Export failed. Please try again.';
}

/**
 * WHAT: Legacy alert() for export errors.
 * WHY: Old code paths; new UI uses ExportErrorBanner.
 * HOW: Delegates to getExportErrorMessage then window.alert.
 * @deprecated Prefer banner + getExportErrorMessage
 */
export function showExportError(err) {
  const msg = getExportErrorMessage(err);
  if (!msg) return;
  window.alert(msg);
}
