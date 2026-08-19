interface PartData {
  description: string;
  manufacturerCode?: string;
  typeId?: number;
  tags?: string[];
  dimensions?: string;
  mountingType?: string;
  package?: string;
  pinCount?: number;
  pinPitch?: string;
  series?: string;
  voltageRating?: string;
  inputVoltage?: string;
  outputVoltage?: string;
  manufacturer?: string;
  productPage?: string;
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
  pin_pitch?: string | null;
  series?: string | null;
  voltage_rating?: string | null;
  input_voltage?: string | null;
  output_voltage?: string | null;
  manufacturer?: string | null;
  product_page?: string | null;
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

  if (data.pinPitch && data.pinPitch.trim() && data.pinPitch.length > 100) {
    errors.pinPitch = 'Pin pitch must be 100 characters or less';
  }

  if (data.inputVoltage && data.inputVoltage.trim() && data.inputVoltage.length > 100) {
    errors.inputVoltage = 'Input voltage must be 100 characters or less';
  }

  if (data.outputVoltage && data.outputVoltage.trim() && data.outputVoltage.length > 100) {
    errors.outputVoltage = 'Output voltage must be 100 characters or less';
  }

  // Validate manufacturer
  if (data.manufacturer && data.manufacturer.trim() && data.manufacturer.length > 255) {
    errors.manufacturer = 'Manufacturer must be 255 characters or less';
  }

  // Validate product page
  if (data.productPage && data.productPage.trim() && data.productPage.length > 500) {
    errors.productPage = 'Product page must be 500 characters or less';
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

export function formatPartForDisplay(part: Part | { key: string; description?: string | null; manufacturer_code?: string | null }): {
  displayId: string;
  displayDescription: string;
  displayManufacturerCode?: string;
  displayManufacturer?: string;
  displayProductPage?: string;
} {
  return {
    displayId: part.key.toUpperCase(),
    displayDescription: part.description || part.key,
    displayManufacturerCode: part.manufacturer_code || undefined,
    displayManufacturer: 'manufacturer' in part ? part.manufacturer || undefined : undefined,
    displayProductPage: 'product_page' in part ? part.product_page || undefined : undefined,
  };
}

