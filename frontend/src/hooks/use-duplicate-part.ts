import { useMemo } from 'react';
import { useGetPartsByPartKey } from '@/lib/api/generated/hooks';
import { usePartDocuments } from './use-part-documents';
import { useCoverAttachment } from './use-cover-image';

export function useDuplicatePart(partId: string | undefined) {
  const partQuery = useGetPartsByPartKey(
    { path: { part_key: partId! } },
    { enabled: !!partId }
  );

  const { documents } = usePartDocuments(partId!);
  const { coverAttachment } = useCoverAttachment(partId!);

  // Transform API part data to form data format
  const formData = useMemo(() => {
    if (!partQuery.data) return null;

    const part = partQuery.data;
    return {
      manufacturerCode: part.manufacturer_code || '',
      typeId: part.type_id?.toString() || '',
      description: part.description || '',
      tags: part.tags || [],
      sellerName: part.seller || '',
      sellerUrl: part.seller_link || '',
      pinCount: part.pin_count?.toString() || '',
    };
  }, [partQuery.data]);

  // Get cover document ID
  const coverDocumentId = useMemo(() => {
    return coverAttachment?.id || null;
  }, [coverAttachment]);

  return {
    isLoading: partQuery.isLoading,
    error: partQuery.error,
    formData,
    documents,
    coverDocumentId,
    originalPart: partQuery.data,
  };
}