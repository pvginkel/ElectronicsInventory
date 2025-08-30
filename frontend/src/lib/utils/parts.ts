interface PartData {
  description: string;
  manufacturerCode?: string;
  typeId?: number;
  tags?: string[];
  dimensions?: string;
  mountingType?: string;
  package?: string;
  pinCount?: number;
  series?: string;
  voltageRating?: string;
}

interface Part {
  key: string;
  description: string;
  manufacturer_code?: string | null;
  type_id?: number | null;
  tags?: string[] | null;
  quantity?: number;
  dimensions?: string | null;
  mounting_type?: string | null;
  package?: string | null;
  pin_count?: number | null;
  series?: string | null;
  voltage_rating?: string | null;
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

  // Validate new string fields (max 100 characters)
  const stringFields = [
    { field: data.dimensions, name: 'Dimensions' },
    { field: data.mountingType, name: 'Mounting type' },
    { field: data.package, name: 'Package' },
    { field: data.series, name: 'Series' },
    { field: data.voltageRating, name: 'Voltage rating' }
  ];

  stringFields.forEach(({ field, name }) => {
    if (field && field.trim() && field.length > 100) {
      errors.push(`${name} must be 100 characters or less`);
    }
  });

  // Validate pin count
  if (data.pinCount !== undefined && data.pinCount !== null) {
    if (!Number.isInteger(data.pinCount) || data.pinCount < 1 || data.pinCount > 9999) {
      errors.push('Pin count must be a positive integer between 1 and 9999');
    }
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

