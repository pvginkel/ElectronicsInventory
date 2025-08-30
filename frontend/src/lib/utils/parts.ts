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

export function validatePartData(data: PartData): { 
  isValid: boolean; 
  errors: Partial<Record<keyof PartData, string>> 
} {
  const errors: Partial<Record<keyof PartData, string>> = {};

  // Validate description
  if (!data.description?.trim()) {
    errors.description = 'Description is required';
  } else if (data.description.length > 200) {
    errors.description = 'Description must be 200 characters or less';
  }

  // Validate manufacturer code
  if (data.manufacturerCode && data.manufacturerCode.length > 100) {
    errors.manufacturerCode = 'Manufacturer code must be 100 characters or less';
  }

  // Validate string fields (max 100 characters)
  if (data.dimensions && data.dimensions.trim() && data.dimensions.length > 100) {
    errors.dimensions = 'Dimensions must be 100 characters or less';
  }

  if (data.mountingType && data.mountingType.trim() && data.mountingType.length > 100) {
    errors.mountingType = 'Mounting type must be 100 characters or less';
  }

  if (data.package && data.package.trim() && data.package.length > 100) {
    errors.package = 'Package must be 100 characters or less';
  }

  if (data.series && data.series.trim() && data.series.length > 100) {
    errors.series = 'Series must be 100 characters or less';
  }

  if (data.voltageRating && data.voltageRating.trim() && data.voltageRating.length > 100) {
    errors.voltageRating = 'Voltage rating must be 100 characters or less';
  }

  // Validate pin count
  if (data.pinCount !== undefined && data.pinCount !== null) {
    if (!Number.isInteger(data.pinCount) || data.pinCount < 1 || data.pinCount > 9999) {
      errors.pinCount = 'Pin count must be a positive integer between 1 and 9999';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
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

