import React, { useState } from 'react';

export type VaultPageToken = number | 'ellipsis';

export interface VaultPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  position: 'top' | 'bottom';
}

function getPageNumbers(currentPage: number, totalPages: number): VaultPageToken[] {
  const windowSize = 5;
  if (totalPages <= windowSize + 1) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: VaultPageToken[] = [];
  const lastWindowStart = totalPages - windowSize + 1;

  if (currentPage <= 3) {
    pages.push(...Array.from({ length: windowSize }, (_, index) => index + 1));
    pages.push('ellipsis', totalPages);
    return pages;
  }

  if (currentPage >= lastWindowStart + 2) {
    pages.push(1, 'ellipsis');
    pages.push(...Array.from({ length: windowSize }, (_, index) => lastWindowStart + index));
    return pages;
  }

  const start = currentPage - Math.floor(windowSize / 2);
  pages.push(1, 'ellipsis');
  pages.push(...Array.from({ length: windowSize }, (_, index) => start + index));
  pages.push('ellipsis', totalPages);
  return pages;
}

function getMobilePageNumbers(currentPage: number, totalPages: number): VaultPageToken[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: VaultPageToken[] = [1];
  if (currentPage > 2) pages.push('ellipsis');
  if (currentPage !== 1 && currentPage !== totalPages) pages.push(currentPage);
  if (currentPage < totalPages - 1) pages.push('ellipsis');
  if (totalPages !== 1) pages.push(totalPages);
  return pages;
}

const pageButtonClass =
  'min-w-9 rounded-full border px-2.5 py-2 text-sm font-medium transition-all';
const secondaryButtonClass =
  'rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium text-fg-muted transition-all hover:border-accent/40 hover:bg-accent-soft hover:text-accent disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-surface disabled:hover:text-fg-muted';

export function VaultPagination({
  currentPage,
  totalPages,
  onPageChange,
  position,
}: VaultPaginationProps): React.ReactElement {
  const [jumpValue, setJumpValue] = useState('');
  const desktopPageNumbers = getPageNumbers(currentPage, totalPages);
  const mobilePageNumbers = getMobilePageNumbers(currentPage, totalPages);
  const label = position === 'top' ? 'Character pages (top)' : 'Character pages (bottom)';

  const handleJumpSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedPage = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(requestedPage)) return;

    onPageChange(Math.min(totalPages, Math.max(1, requestedPage)));
    setJumpValue('');
  };

  const renderPageNumbers = (pages: VaultPageToken[], keyPrefix: string) =>
    pages.map((page, index) =>
      page === 'ellipsis' ? (
        <span
          key={`${keyPrefix}-ellipsis-${index}`}
          className="px-1 text-sm text-fg-subtle"
          aria-hidden="true"
        >
          ...
        </span>
      ) : (
        <button
          key={`${keyPrefix}-${page}`}
          type="button"
          onClick={() => onPageChange(page)}
          aria-current={page === currentPage ? 'page' : undefined}
          aria-label={`Go to page ${page}`}
          className={`${pageButtonClass} ${
            page === currentPage
              ? 'border-accent bg-accent text-accent-fg'
              : 'border-border bg-surface text-fg-muted hover:border-accent/40 hover:bg-accent-soft hover:text-accent'
          }`}
        >
          {page}
        </button>
      ),
    );

  return (
    <nav
      aria-label={label}
      className={`flex flex-col items-center gap-3 sm:flex-row sm:justify-between ${
        position === 'top' ? 'mb-6' : 'pt-8 pb-20'
      }`}
    >
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
        <p className="text-sm text-fg-muted">
          Page {currentPage} of {totalPages}
        </p>

        <div className="hidden items-center gap-1.5 sm:flex" role="group" aria-label="Page navigation">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className={secondaryButtonClass}
          >
            Previous
          </button>
          {renderPageNumbers(desktopPageNumbers, `${position}-desktop`)}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className={secondaryButtonClass}
          >
            Next
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:hidden" role="group" aria-label="Page navigation">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            aria-label="Go to previous page"
            className={secondaryButtonClass}
          >
            Prev
          </button>
          {renderPageNumbers(mobilePageNumbers, `${position}-mobile`)}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            aria-label="Go to next page"
            className={secondaryButtonClass}
          >
            Next
          </button>
        </div>
      </div>

      {totalPages > 10 && (
        <form onSubmit={handleJumpSubmit} className="flex items-center gap-2 text-sm">
          <label htmlFor={`${position}-page-jump`} className="text-fg-muted">
            Go to page
          </label>
          <input
            id={`${position}-page-jump`}
            type="number"
            min={1}
            max={totalPages}
            inputMode="numeric"
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            placeholder={String(currentPage)}
            aria-label={`Page number from 1 to ${totalPages}`}
            className="w-16 rounded-lg border border-border bg-surface px-2.5 py-2 text-center text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button type="submit" className={secondaryButtonClass}>
            Go
          </button>
        </form>
      )}
    </nav>
  );
}
