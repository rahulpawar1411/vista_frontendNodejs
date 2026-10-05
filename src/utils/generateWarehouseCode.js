/**
 * WHAT: Turns a warehouse name into an uppercase code fragment.
 * WHY: Auto codes like WH-PUNE-01 need a stable slug from the name.
 * HOW: Strips non-alphanumeric, hyphenates, truncates to maxLen.
 */
function slugPart(value, maxLen = 12) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, maxLen);
}

/** WHAT: Public slug helper for warehouse master forms. WHY/HOW: City is ignored; name drives the code. */
export function warehouseCodeSlug(warehouseName, _city) {
  return slugPart(warehouseName, 12);
}

/**
 * WHAT: Suggests the next warehouse code WH-{SLUG}-01, -02, …
 * WHY: Super Admin should not invent duplicate codes manually.
 * HOW: Scans existingCodes for same prefix and increments the numeric suffix.
 */
export function generateWarehouseCode(warehouseName, city, existingCodes = []) {
  const slug = warehouseCodeSlug(warehouseName, city);
  if (!slug) return '';
  const prefix = `WH-${slug}`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}(?:-(\\d+))?$`, 'i');
  let max = 0;
  (existingCodes || []).forEach((raw) => {
    const code = String(raw || '').trim().toUpperCase();
    const m = code.match(re);
    if (!m) return;
    const n = m[1] ? parseInt(m[1], 10) : 1;
    if (Number.isFinite(n) && n > max) max = n;
  });
  const next = max + 1;
  return `${prefix}-${String(next).padStart(2, '0')}`.slice(0, 48);
}
