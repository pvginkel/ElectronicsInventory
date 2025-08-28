interface PartData {
  description: string;
  manufacturerCode?: string;
  typeId?: number;
  tags?: string[];
}

interface Part {
  key: string;
  description: string;
  manufacturer_code?: string | null;
  type_id?: number | null;
  tags?: string[] | null;
  quantity?: number;
}

export function validatePartData(data: PartData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.description?.trim()) {
    errors.push('Description is required');
  }

  if (data.description && data.description.length > 200) {
    errors.push('Description must be 200 characters or less');
  }

  if (data.manufacturerCode && data.manufacturerCode.length > 100) {
    errors.push('Manufacturer code must be 100 characters or less');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function formatPartForDisplay(part: Part): {
  displayId: string;
  displayDescription: string;
  displayManufacturerCode?: string;
} {
  return {
    displayId: part.key.toUpperCase(),
    displayDescription: part.description,
    displayManufacturerCode: part.manufacturer_code || undefined,
  };
}

