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
      description: part.description,
      manufacturerCode: part.manufacturer_code || '',
      typeId: part.type_id || undefined,
      tags: part.tags || [],
      manufacturer: part.manufacturer || '',
      productPage: part.product_page || '',
      seller: part.seller || '',
      sellerLink: part.seller_link || '',
      dimensions: part.dimensions || '',
      mountingType: part.mounting_type || '',
      package: part.package || '',
      pinCount: part.pin_count?.toString() || '',
      pinPitch: part.pin_pitch || '',
      series: part.series || '',
      voltageRating: part.voltage_rating || '',
      inputVoltage: part.input_voltage || '',
      outputVoltage: part.output_voltage || '',
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