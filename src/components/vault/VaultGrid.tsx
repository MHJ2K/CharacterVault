import React from 'react';
import { Users } from 'lucide-react';
import type { CharacterListItem } from '../../db';
import type { CardExportFormat } from './types';
import { CharacterCard } from './CharacterCard';
import { CharacterCardSkeleton } from './CharacterCardSkeleton';
import { VaultPagination } from './VaultPagination';

export interface VaultGridProps {
  isLoading: boolean;
  pageSize: number;
  sortedCharacters: CharacterListItem[];
  visibleCharacters: CharacterListItem[];
  searchQuery: string;
  safeCurrentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onScrollToTop: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onExport: (id: string, format: CardExportFormat) => Promise<void>;
  exportingCardId: string | null;
  onImportClick: () => void;
}

export function VaultGrid({
  isLoading,
  pageSize,
  sortedCharacters,
  visibleCharacters,
  searchQuery,
  safeCurrentPage,
  totalPages,
  onPageChange,
  onScrollToTop,
  onOpen,
  onDuplicate,
  onDelete,
  onExport,
  exportingCardId,
  onImportClick,
}: VaultGridProps): React.ReactElement {
  const handleTopPageChange = (page: number) => {
    onPageChange(page);
  };

  const handleBottomPageChange = (page: number) => {
    onPageChange(page);
    onScrollToTop();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
        {[...Array(pageSize)].map((_, i) => (
          <CharacterCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (sortedCharacters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6 border border-border">
          <Users className="w-10 h-10 text-fg-subtle" />
        </div>
        <h3 className="text-lg font-medium text-fg">No characters found</h3>
        <p className="text-fg-muted mt-2 mb-8 max-w-sm">
          {searchQuery
            ? `No results for “${searchQuery}”`
            : 'Get started by creating a new character or importing a card.'}
        </p>
        {!searchQuery && (
          <button
            type="button"
            onClick={onImportClick}
            className="px-6 py-2.5 border border-border-strong rounded-xl hover:bg-accent-soft hover:text-accent transition-colors font-medium"
          >
            Import Card
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <VaultPagination
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        onPageChange={handleTopPageChange}
        position="top"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {visibleCharacters.map((char, index) => (
          <CharacterCard
            key={`${char.id}-${index}`}
            character={char}
            onOpen={onOpen}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onExport={onExport}
            isExporting={exportingCardId === char.id}
          />
        ))}
      </div>

      <VaultPagination
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        onPageChange={handleBottomPageChange}
        position="bottom"
      />
    </>
  );
}
