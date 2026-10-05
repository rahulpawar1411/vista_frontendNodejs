/**
 * WHAT: Formatting helpers shared by LogProfileDetailModal and exports.
 * WHY: Dates, quantities, and image URLs must look the same everywhere.
 * HOW: Pure functions — no React; resolveImageSrc delegates to resolveMediaSrc.
 */

import { resolveMediaSrc as resolveMediaFromUtils } from '../../utils/resolveMediaSrc';

/** WHAT: Date as DD-MM-YYYY. WHY/HOW: Indian-style display; invalid dates fall back to string. */
export function formatDateStr(dateVal) {
  if (!dateVal) return '-';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return dateVal;
  }
}

/** WHAT: Date and time as DD-MM-YYYY HH:mm. WHY/HOW: Audit timestamps in detail modal. */
export function formatDateTimeStr(dateVal) {
  if (!dateVal) return '-';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  } catch {
    return dateVal;
  }
}

/** WHAT: Human duration from hours + minutes fields. WHY/HOW: Shows days when hours ≥ 24. */
export function formatDuration(hoursStr, minsStr) {
  const hours = parseInt(hoursStr, 10) || 0;
  const mins = parseInt(minsStr, 10) || 0;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h ${mins}m`;
  }
  return `${hours}h ${mins}m`;
}

/** WHAT: True when updated_at is after created_at. WHY/HOW: Shows "Edited" badge on profile. */
export function getUpdateDiff(created, updated) {
  if (!created || !updated) return false;
  const cTime = Math.floor(new Date(created).getTime() / 1000);
  const uTime = Math.floor(new Date(updated).getTime() / 1000);
  return uTime > cTime;
}

/** WHAT: Quantity with Indian number grouping. WHY/HOW: Box counts in detail grid. */
export function formatQty(val) {
  if (val == null || val === '') return '0';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val).trim();
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  }).format(n);
}

/** WHAT: Best URL for a stored photo path. WHY/HOW: Same Cloudinary/uploads logic as FallbackImg. */
export function resolveImageSrc(path) {
  return resolveMediaFromUtils(path);
}
