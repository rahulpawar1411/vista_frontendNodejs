import React from 'react';
import LogProfileDetailModal from '../../components/LogProfileDetailModal/LogProfileDetailModal';
import './SubAdminLogProfileScreen.css';

/**
 * WHAT: Full-page wrapper around LogProfileDetailModal for customer app.
 * WHY: Mobile customer flow uses a dedicated screen instead of overlay modal.
 * HOW: Passes fullScreen to modal; onBack closes the detail view.
 */
export default function SubAdminLogProfileScreen({ log, detailType, onBack }) {
  if (!log) return null;

  return (
    <LogProfileDetailModal
      log={log}
      detailType={detailType}
      onClose={onBack}
      fullScreen
    />
  );
}
