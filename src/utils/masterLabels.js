/**
 * WHAT: Builds a display string like "WH-PUNE-01 — Pune Warehouse".
 * WHY: Dropdowns and tables should show both code and human name.
 * HOW: Joins trimmed code and name with an em dash when both exist.
 */
export function formatMasterLabel(code, name) {
  const c = String(code || '').trim();
  const n = String(name || '').trim();
  if (c && n) return `${c} — ${n}`;
  return c || n || '';
}

/**
 * WHAT: Picks the value stored in a master-data option (warehouse or client row).
 * WHY: Forms may receive a full row object or a plain string from the API.
 * HOW: Returns code fields first, then name fields, or the string as-is.
 */
export function masterOptionValue(row) {
  if (!row) return '';
  if (typeof row === 'string') return row;
  return String(row.code || row.warehouse_code || row.client_code || row.name || row.warehouse_name || row.client_name || '').trim();
}

/**
 * WHAT: Finds the friendly label for a stored code or name.
 * WHY: History logs often store codes; the UI should show "code — name".
 * HOW: Case-insensitive match against options list, else returns the raw value.
 */
export function lookupMasterLabel(value, options = []) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  const hit = (options || []).find((row) => {
    const code = String(row.code || row.warehouse_code || row.client_code || '').trim().toLowerCase();
    const name = String(row.name || row.warehouse_name || row.client_name || '').trim().toLowerCase();
    return code === v || name === v;
  });
  if (hit) {
    return formatMasterLabel(
      hit.code || hit.warehouse_code || hit.client_code,
      hit.name || hit.warehouse_name || hit.client_name
    );
  }
  return String(value || '').trim();
}
