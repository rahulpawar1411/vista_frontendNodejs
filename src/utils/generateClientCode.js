/**
 * WHAT: Suggests client master code CL-{warehouse}-{client} from names/codes.
 * WHY: Client codes must tie to a warehouse for filtering and reports.
 * HOW: Builds tokens from warehouse code or initials plus client name slug.
 */
export function generateClientCode(clientName, warehouseName, warehouseCode) {
  const slugPart = (value, maxLen = 14) =>
    String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .slice(0, maxLen);

  const warehouseToken = () => {
    const code = String(warehouseCode || '').trim().toUpperCase();
    if (code) {
      const stripped = code.replace(/^WH-/i, '');
      if (stripped) return slugPart(stripped, 10);
    }
    const name = String(warehouseName || '').trim();
    if (!name) return '';
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return words
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 8);
    }
    return slugPart(words[0], 10);
  };

  const clientToken = () => {
    const name = String(clientName || '').trim();
    if (!name) return '';
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words[0].length <= 6) {
      return slugPart(words[0], 12);
    }
    return slugPart(name.replace(/\s+/g, '-'), 16);
  };

  const clientPart = clientToken();
  if (!clientPart) return '';
  const whPart = warehouseToken();
  const raw = whPart ? `CL-${whPart}-${clientPart}` : `CL-${clientPart}`;
  return raw.replace(/-+/g, '-').slice(0, 48);
}
