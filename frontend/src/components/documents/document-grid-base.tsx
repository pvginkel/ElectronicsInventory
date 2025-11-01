import { DocumentTile } from './document-tile';
import { DocumentIcon } from '@/components/icons/DocumentIcon';
import { EmptyState } from '@/components/ui/empty-state';
import type { DocumentGridProps } from '@/types/documents';

export function DocumentGridBase({
  documents,
  onTileClick,
  onToggleCover,
  onDelete,
  showCoverToggle = true
}: DocumentGridProps) {

  if (documents.length === 0) {
    return (
      <EmptyState
        testId="documents.grid.empty"
        title="No documents yet"
        description="Add images, PDFs, or website links to document this part."
        icon={DocumentIcon}
      />
    );
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
      {documents.sort((a, b) => a.id.localeCompare(b.id)).map((document) => (
        <DocumentTile
          key={document.id}
          document={document}
          onTileClick={onTileClick}
          onToggleCover={onToggleCover}
          onDelete={onDelete}
          showCoverToggle={showCoverToggle}
        />
      ))}
    </div>
  );
}