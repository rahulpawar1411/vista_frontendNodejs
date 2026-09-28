/** Chamber-type temperature compliance (Frozen / Chilled / Dry / Other). */

export function normalizeChamberZone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/froz/i.test(s)) return 'Frozen';
  if (/chill/i.test(s)) return 'Chilled';
  if (/dry/i.test(s)) return 'Dry';
  if (/other/i.test(s)) return 'Other';
  return s;
}

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

export function getChamberTempRange(chamberType) {
  const zone = pickComplianceZone(chamberType) || normalizeChamberZone(chamberType);
  if (zone === 'Frozen') return { zone, min: null, max: -18, label: '≤ -18°C' };
  if (zone === 'Chilled') return { zone, min: -5, max: 5, label: '-5°C to 5°C' };
  if (zone === 'Dry') return { zone, min: 15, max: 25, label: '15°C to 25°C' };
  if (zone === 'Other') return { zone, min: 0, max: 40, label: '0°C to 40°C' };
  return null;
}

/** @returns {'low'|'high'|null} */
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

export function isChamberTempOutOfRange(temp, chamberType) {
  return getChamberTempDeviation(temp, chamberType) != null;
}

export function formatTempDisplay(temp) {
  if (temp == null || temp === '') return null;
  const t = Number(temp);
  if (!Number.isFinite(t)) return null;
  return `${t % 1 === 0 ? t : t.toFixed(1)}°C`;
}
