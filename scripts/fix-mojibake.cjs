/**
 * Fix UTF-8 mojibake in Super Admin / Sub Admin frontend sources.
 * File is UTF-8; bad sequences are literal chars like â€” Â· Â° â†’ â€¦
 */
const fs = require('fs');
const path = require('path');

const roots = [
  path.join(__dirname, '..', 'src', 'pages', 'SuperAdminSecureWindow'),
  path.join(__dirname, '..', 'src', 'pages', 'SubAdminSecureWindow'),
];

const exts = new Set(['.jsx', '.js', '.tsx', '.ts', '.css']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(name))) out.push(p);
  }
  return out;
}

function dumpNearby(text, needle) {
  const i = text.indexOf(needle);
  if (i < 0) return null;
  const slice = text.slice(i, i + needle.length);
  return [...slice].map((ch) => ch.codePointAt(0).toString(16)).join(' ');
}

// Build replacements from known code-point sequences
const REPLACEMENTS = [
  // em dash —
  ['\u00E2\u20AC\u201D', '\u2014'], // â€”
  ['\u00E2\u20AC\u2014', '\u2014'], // â€—
  // en dash –
  ['\u00E2\u20AC\u201C', '\u2013'], // â€œ (sometimes en-dash misread)
  ['\u00E2\u20AC\u2013', '\u2013'], // â€“
  // ellipsis …
  ['\u00E2\u20AC\u00A6', '\u2026'], // â€¦
  // apostrophe ’
  ['\u00E2\u20AC\u2122', '\u2019'], // â€™ (TM form)
  ['\u00E2\u20AC\u2019', '\u2019'], // â€™
  // curly quotes “ ”
  ['\u00E2\u20AC\u0153', '\u201C'], // â€œ
  // middle dot ·
  ['\u00C2\u00B7', '\u00B7'], // Â·
  // degree °
  ['\u00C2\u00B0', '\u00B0'], // Â°
  // arrow → (E2 86 92 → â † ’)
  ['\u00E2\u2020\u2019', '\u2192'], // â†’
  ['\u00E2\u2020\u201D', '\u2192'], // â†”
  // long arrow ⟶ sometimes as âž”
  ['\u00E2\u017E\u201D', '\u2192'], // âž”
  ['\u00E2\u017E\u201D', '\u2192'],
  // bullet •
  ['\u00E2\u20AC\u00A2', '\u2022'], // â€¢
  // ×
  ['\u00C3\u0097', '\u00D7'], // Ã—
  // ← left arrow (E2 86 90 → â † \u0090)
  ['\u00E2\u2020\u0090', '\u2190'],
  // ✓ check mark (E2 9C 93 → â œ “)
  ['\u00E2\u0153\u201C', '\u2713'],
  // NBSP / stray Â
  ['\u00C2\u00A0', '\u00A0'],
  ['\u00C2 ', ' '],
];

function fixText(text) {
  let s = text;
  const counts = [];
  for (const [bad, good] of REPLACEMENTS) {
    let n = 0;
    if (bad && s.includes(bad)) {
      n = s.split(bad).length - 1;
      s = s.split(bad).join(good);
      counts.push({ badHex: dumpNearby(text, bad), good, n });
    }
  }
  return { s, counts };
}

function leftoverMarkers(text) {
  const found = new Map();
  // Find â / Â / Ã followed by combining-ish chars
  for (const m of text.matchAll(/\u00E2[\u0080-\u00FF\u2010-\u2030\u20AC\u2020\u2022\u0153\u017E\u2122]{1,3}|\u00C2[\u00A0-\u00BF]|\u00C3[\u0080-\u00BF]/g)) {
    const k = m[0];
    found.set(k, (found.get(k) || 0) + 1);
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k, n]) => ({
      n,
      chars: k,
      hex: [...k].map((ch) => ch.codePointAt(0).toString(16)).join(' '),
    }));
}

// Diagnose first file samples
const diagnoseFile = path.join(
  roots[0],
  'SuperAdminSecureWindow.jsx'
);
if (fs.existsSync(diagnoseFile)) {
  const raw = fs.readFileSync(diagnoseFile, 'utf8');
  const samples = ['Loading data', 'Box Temp', 'Before', 'Exporting', 'Chamber type'];
  for (const sample of samples) {
    const i = raw.indexOf(sample);
    if (i < 0) continue;
    const slice = raw.slice(i, i + 40);
    console.log('SAMPLE', JSON.stringify(slice));
    console.log(
      '  HEX',
      [...slice].map((ch) => ch.codePointAt(0).toString(16)).join(' ')
    );
  }
  console.log('LEFTOVER BEFORE', leftoverMarkers(raw).slice(0, 15));
}

const files = roots.flatMap((r) => walk(r));
let changedFiles = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const { s, counts } = fixText(before);
  if (s !== before) {
    fs.writeFileSync(file, s, 'utf8');
    changedFiles += 1;
    console.log('FIXED', path.relative(path.join(__dirname, '..'), file));
    for (const c of counts) console.log('  ', c.n, 'x ->', c.good, '(from', c.badHex + ')');
  }
  const left = leftoverMarkers(s !== before ? s : before);
  if (left.length) {
    console.log(
      'LEFTOVER',
      path.basename(file),
      left.slice(0, 12).map((x) => `${x.n}:${x.hex}`).join(' | ')
    );
  }
}
console.log('Done. Changed files:', changedFiles);
