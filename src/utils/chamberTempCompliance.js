/**
 * WHAT: Normalizes chamber type text to Frozen, Chilled, Dry, or Other.
 * WHY: Logs may spell types differently; compliance rules need one canonical zone.
 * HOW: Trims the string and matches keywords (froz, chill, dry, other).
 */

export function normalizeChamberZone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/froz/i.test(s)) return 'Frozen';
  if (/chill/i.test(s)) return 'Chilled';
  if (/dry/i.test(s)) return 'Dry';
  if (/other/i.test(s)) return 'Other';
  return s;
}

/**
 * WHAT: Chooses the best chamber zone from several possible field values on a log row.
 * WHY: A record might have zone on assignment, chamber master, or the log itself.
 * HOW: Walks candidates and returns the first known zone, else first non-empty normalize.
 */
export function pickComplianceZone(...candidates) {
  for (const c of candidates) {
    const t = normalizeChamberZone(c);
    if (t === 'Frozen' || t === 'Chilled' || t === 'Dry' || t === 'Other') return t;
  }
  for (const c of candidates) {
    const t = normalizeChamberZone(c);
    if (t) return t;
  }
  return '';
}

/**
 * WHAT: Returns min/max temperature limits and a label for a chamber type.
 * WHY: UI colors and export flags depend on whether a reading is in range.
 * HOW: Maps Frozen/Chilled/Dry/Other to fixed business rules (e.g. Frozen ≤ -18°C).
 */
export function getChamberTempRange(chamberType) {
  const zone = pickComplianceZone(chamberType) || normalizeChamberZone(chamberType);
  if (zone === 'Frozen') return { zone, min: null, max: -18, label: '≤ -18°C' };
  if (zone === 'Chilled') return { zone, min: -5, max: 5, label: '-5°C to 5°C' };
  if (zone === 'Dry') return { zone, min: 15, max: 25, label: '15°C to 25°C' };
  if (zone === 'Other') return { zone, min: 0, max: 40, label: '0°C to 40°C' };
  return null;
}

/**
 * WHAT: Tells if a temperature is too low, too high, or OK for the chamber type.
 * WHY: Operators and admins need quick red/green compliance on each reading.
 * HOW: Compares numeric temp to getChamberTempRange min/max; returns 'low', 'high', or null.
 * @returns {'low'|'high'|null}
 */
export function getChamberTempDeviation(temp, chamberType) {
  const range = getChamberTempRange(chamberType);
  if (!range) return null;
  if (temp == null || temp === '') return null;
  const t = Number(temp);
  if (!Number.isFinite(t)) return null;
  if (range.min == null) {
    if (t > range.max) return 'high';
    return null;
  }
  if (t < range.min) return 'low';
  if (t > range.max) return 'high';
  return null;
}

/** WHAT: True when getChamberTempDeviation finds low or high. WHY/HOW: Shortcut for badges and filters. */
export function isChamberTempOutOfRange(temp, chamberType) {
  return getChamberTempDeviation(temp, chamberType) != null;
}

/**
 * WHAT: Formats a number as "12°C" or "12.5°C" for display.
 * WHY: Tables should show a degree symbol and hide invalid values.
 * HOW: Parses number; whole numbers omit decimals.
 */
export function formatTempDisplay(temp) {
  if (temp == null || temp === '') return null;
  const t = Number(temp);
  if (!Number.isFinite(t)) return null;
  return `${t % 1 === 0 ? t : t.toFixed(1)}°C`;
}
