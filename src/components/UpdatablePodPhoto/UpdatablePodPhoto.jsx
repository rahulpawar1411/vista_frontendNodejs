// ====================================================================
// Updatable POD Photo card — DO can replace without admin edit permission
// ====================================================================

import React, { useRef, useState } from 'react';
import { Camera, Loader2, ImagePlus } from 'lucide-react';
import { updateInwardPodPhoto, updateOutwardPodPhoto } from '../../services/api';
import FallbackImg from '../FallbackImg/FallbackImg';
import './UpdatablePodPhoto.css';

/**
 * WHAT: POD photo thumbnail with camera button to upload a replacement.
 * WHY: DO may fix a bad POD without waiting for Super Admin edit approval.
 * HOW: PUT pod-photo endpoint via updateInwardPodPhoto or updateOutwardPodPhoto by type.
 */
export default function UpdatablePodPhoto({
  type, // 'inward' | 'outward'
  recordId,
  photoPath,
  onUpdated,
  onPreview
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const hasPhoto = photoPath && String(photoPath).trim();

  const handlePick = (e) => {
    e.stopPropagation();
    if (uploading) return;
    inputRef.current?.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !recordId) return;

    // Some phones send empty MIME — still allow common image picks
    if (file.type && !file.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name || '')) {
      alert('Please select an image file for POD Photo.');
      return;
    }

    setUploading(true);
    try {
      const res =
        type === 'inward'
          ? await updateInwardPodPhoto(recordId, file)
          : await updateOutwardPodPhoto(recordId, file);

      const newPath =
        type === 'inward' ? res.inward_pod_photo : res.outward_pod_photo;

      if (typeof onUpdated === 'function') {
        onUpdated({
          photoPath: newPath,
          update_details: res.update_details,
          update_count: res.update_count,
          updated_at:
            type === 'inward' ? res.inward_updated_at : res.outward_updated_at
        });
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to update POD photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="profile-photo-card updatable-pod-card">
      <div
        className="profile-photo-wrapper"
        onClick={() => {
          if (hasPhoto && typeof onPreview === 'function') onPreview(photoPath);
        }}
        role={hasPhoto ? 'button' : undefined}
        style={{ cursor: hasPhoto ? 'pointer' : 'default' }}
      >
        {hasPhoto ? (
          <FallbackImg src={photoPath} alt="POD" />
        ) : (
          <div className="pod-photo-empty">
            <ImagePlus size={28} color="#94a3b8" />
            <span>No POD yet</span>
          </div>
        )}
        {uploading && (
          <div className="pod-photo-uploading">
            <Loader2 size={22} className="spinner-icon" color="#fff" />
          </div>
        )}
      </div>
      <div className="profile-photo-label">POD Photo</div>
      <button
        type="button"
        className="pod-update-btn"
        onClick={handlePick}
        disabled={uploading || !recordId}
        title="Update POD photo without admin permission"
      >
        <Camera size={13} />
        <span>{uploading ? 'Uploading…' : hasPhoto ? 'Update POD' : 'Add POD'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}
