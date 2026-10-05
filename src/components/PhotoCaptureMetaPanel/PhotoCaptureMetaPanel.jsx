import React from 'react';
import PhotoGpsLink from '../PhotoGpsLink/PhotoGpsLink';
import { PHOTO_META_EXPORT_LABELS } from '../../utils/photoCaptureExport';

function parsePhotoCaptureMetadata(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * WHAT: Lists capture time and GPS for each photo field on a log.
 * WHY: Detail modals must show audit metadata stored in JSON alongside images.
 * HOW: Parses metadata object/array and renders labels with PhotoGpsLink where GPS exists.
 */
export default function PhotoCaptureMetaPanel({ metadata }) {
  const meta = parsePhotoCaptureMetadata(metadata);
  if (!meta || typeof meta !== 'object') return null;

  const rows = [];
  Object.entries(meta).forEach(([key, val]) => {
    const baseLabel = PHOTO_META_EXPORT_LABELS[key] || key.replace(/_/g, ' ');
    if (Array.isArray(val)) {
      val.forEach((entry, idx) => {
        rows.push({
          label: val.length > 1 ? `${baseLabel} #${idx + 1}` : baseLabel,
          entry,
        });
      });
    } else if (val && typeof val === 'object') {
      rows.push({ label: baseLabel, entry: val });
    }
  });

  if (!rows.length) return null;

  return (
    <div className="profile-group-card">
      <div className="profile-group-title">Photo capture time & location</div>
      <div className="profile-grid-list">
        {rows.map((row, idx) => (
          <div className="profile-item" key={`photo-meta-${idx}`} style={{ gridColumn: 'span 2' }}>
            <span className="profile-label">{row.label}</span>
            <span className="profile-value">
              <div>{row.entry.capturedAt ? String(row.entry.capturedAt) : '-'}</div>
              <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                <PhotoGpsLink
                  lat={row.entry.latitude}
                  lng={row.entry.longitude}
                  accuracy={row.entry.accuracy}
                />
              </div>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
