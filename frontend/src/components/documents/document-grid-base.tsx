import { DocumentTile } from './document-tile';
import { DocumentIcon } from '@/components/icons/DocumentIcon';
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
      <div className="text-center py-12">
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <DocumentIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No documents yet</h3>
        <p className="text-muted-foreground mb-4">
          Add images, PDFs, or website links to document this part.
        </p>
      </div>
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