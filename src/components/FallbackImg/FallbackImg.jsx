import React, { useEffect, useMemo, useState } from 'react';
import { buildMediaSrcCandidates } from '../../utils/resolveMediaSrc';

/**
 * WHAT: Image tag that tries backup URLs if the first photo link fails.
 * WHY: Old Cloudinary links and new /uploads paths both exist in the database.
 * HOW: buildMediaSrcCandidates order; onError advances to the next candidate.
 */
export default function FallbackImg({ src, alt = '', className, style, onClick, ...rest }) {
  const candidates = useMemo(() => buildMediaSrcCandidates(src), [src]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [src]);

  const current = candidates[index];
  if (!current) return null;

  return (
    <img
      src={current}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      onError={() => {
        setIndex((i) => (i + 1 < candidates.length ? i + 1 : i));
      }}
      {...rest}
    />
  );
}

/** WHAT: First URL candidate for full-screen photo preview. WHY/HOW: Same list as FallbackImg, index 0. */
export function resolveLightboxSrc(path) {
  return buildMediaSrcCandidates(path)[0] || null;
}
