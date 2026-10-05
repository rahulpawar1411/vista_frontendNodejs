import React from 'react';
import './PaginationBar.css';

/**
 * WHAT: Previous / page numbers / Next bar for long server-paginated lists.
 * WHY: Every monitor screen should paginate the same way for consistency.
 * HOW: Computes from–to range from page, pageSize, and totalItems; calls onPageChange.
 */
export default function PaginationBar({
  page,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'entries',
  hideWhenEmpty = true
}) {
  const total = Number(totalItems) || 0;
  if (hideWhenEmpty && total <= 0) return null;

  const size = Math.max(1, Number(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * size + 1;
  const to = Math.min(currentPage * size, total);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  return (
    <div className="pagination-bar" data-pagination-locked="true">
      <div className="pagination-bar-info">
        Showing <strong>{from}</strong> to <strong>{to}</strong> of <strong>{total}</strong>
        {itemLabel ? ` ${itemLabel}` : ''}
      </div>
      <div className="pagination-bar-actions">
        <button
          type="button"
          className="pagination-bar-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
        >
          Previous
        </button>

        {pages.map((p, idx, arr) => {
          const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
          return (
            <React.Fragment key={p}>
              {showEllipsis && <span className="pagination-bar-ellipsis">...</span>}
              <button
                type="button"
                className={`pagination-bar-btn pagination-bar-page${p === currentPage ? ' is-active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            </React.Fragment>
          );
        })}

        <button
          type="button"
          className="pagination-bar-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
