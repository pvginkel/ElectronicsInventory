// Frontend domain model types for enhanced location data

export interface PartAssignment {
  key: string;
  qty: number;
  manufacturer_code?: string;
  description?: string;
}

export interface LocationWithParts {
  boxNo: number;
  locNo: number;
  isOccupied: boolean;
  partAssignments: PartAssignment[] | null;
}

export interface LocationDisplayData extends LocationWithParts {
  totalQuantity: number;
  displayText: string;
  isEmpty: boolean;
  stylingClasses: string;
}

// API response types (snake_case from backend)
export interface LocationWithPartsResponse {
  box_no: number;
  loc_no: number;
  is_occupied: boolean;
  part_assignments: PartAssignment[] | null;
}