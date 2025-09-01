import { DocumentGrid } from '@/components/documents/document-grid';
import type { components } from '@/lib/api/generated/types';
import { transformAIDocumentsForGrid } from '@/lib/utils/ai-document-adapter';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];

interface AIDocumentGridProps {
  documents: DocumentSuggestionSchema[];
  onDocumentDelete: (index: number) => void;
  onCoverChange: (index: number) => void;
  readOnly?: boolean;
}

export function AIDocumentGrid({ 
  documents, 
  onDocumentDelete,
  onCoverChange,
  readOnly = false 
}: AIDocumentGridProps) {
  // Transform AI documents to grid format
  const gridDocuments = transformAIDocumentsForGrid(documents);
  
  // Use a placeholder partId since we don't have one yet
  const tempPartId = "ai-preview";
  
  const handleDocumentDelete = (documentId: string) => {
    // Extract index from AI document ID
    const index = parseInt(documentId.replace('ai-doc-', ''));
    if (!isNaN(index)) {
      onDocumentDelete(index);
    }
  };

  const handleCoverChange = (documentId: string) => {
    // Extract index from AI document ID
    const index = parseInt(documentId.replace('ai-doc-', ''));
    if (!isNaN(index)) {
      onCoverChange(index);
    }
  };

  return (
    <DocumentGrid
      partId={tempPartId}
      documents={gridDocuments}
      onDocumentDelete={readOnly ? undefined : handleDocumentDelete}
      onCoverChange={readOnly ? undefined : handleCoverChange}
      hideCoverActions={false} // Show cover actions for AI documents now
    />
  );
}