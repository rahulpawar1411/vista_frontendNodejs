/** Shared chamber / inspection presets for DO Daily Chamber Temp Monitor */
export const CHAMBER_PRESETS = [
  'BDF-1',
  'BDF-2',
  'BDF-3',
  'BDF-4',
  'BDF-5',
  'BDF-6',
  'BDF-7',
  'BDF-8',
  'Antechamber'
];

export const INSPECTION_TIME_PRESETS = ['11:00', '18:00'];

export const DRAFT_STORAGE_KEY = 'do_chamber_temp_form_draft';

/** WHAT: True if chamber name is in the fixed BDF/Antechamber list. WHY/HOW: UI toggles custom vs preset dropdown. */
export function isPresetChamber(name) {
  return CHAMBER_PRESETS.includes(name);
}

/** WHAT: True if time is 11:00 or 18:00 preset. WHY/HOW: Matches warehouse shift inspection slots. */
export function isPresetInspectionTime(time) {
  return INSPECTION_TIME_PRESETS.includes(time);
}

/**
 * WHAT: Loads unsaved daily chamber form fields from sessionStorage.
 * WHY: Accidental refresh should not wipe a long form entry.
 * HOW: JSON parse of DRAFT_STORAGE_KEY; returns null if missing or invalid.
 */
export function readChamberFormDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** WHAT: Saves in-progress form fields to sessionStorage. WHY/HOW: Called on field changes during data entry. */
export function writeChamberFormDraft(formData) {
  try {
    sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        entry_date: formData.entry_date,
        client_name: formData.client_name,
        chamber_name: formData.chamber_name,
        inspection_time: formData.inspection_time,
        chamber_temp: formData.chamber_temp,
        monitor_supervisor_name: formData.monitor_supervisor_name
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** WHAT: Removes the session draft after successful submit. WHY/HOW: Prevents old draft prefill on next entry. */
export function clearChamberFormDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
