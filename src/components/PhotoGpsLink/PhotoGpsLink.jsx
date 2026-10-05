import React from 'react';
import { formatPhotoGpsForExport } from '../../utils/photoCaptureExport';

/**
 * WHAT: Google Maps URL for a latitude/longitude pair.
 * WHY: Shared by PhotoGpsLink and other components that need map links.
 * HOW: Returns null if coordinates are not valid numbers.
 */
export function buildMapsUrl(lat, lng) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * WHAT: Clickable link that opens Google Maps at photo capture coordinates.
 * WHY: Auditors verify where a POD or seal photo was taken.
 * HOW: Builds maps URL from lat/lng; shows accuracy text when provided.
 */
export default function PhotoGpsLink({ lat, lng, accuracy, className = '' }) {
  const text = formatPhotoGpsForExport(lat, lng, accuracy);
  const mapsUrl = buildMapsUrl(lat, lng);
  if (!text || !mapsUrl) return <span>-</span>;
  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className || undefined}
      style={{ color: '#0369a1', fontWeight: 700, textDecoration: 'underline' }}
    >
      {text}
    </a>
  );
}
