interface Location {
  boxNo: number;
  locNo: number;
  quantity?: number;
}

interface PartLocation {
  box_no: number;
  loc_no: number;
  qty: number;
}

export function formatLocation(boxNo: number, locNo: number): string {
  return `${boxNo}-${locNo}`;
}

export function calculateTotalQuantity(locations: Location[]): number {
  return locations.reduce((total, location) => total + (location.quantity || 0), 0);
}

export function formatLocationSummary(locations: PartLocation[]): string {
  if (!locations?.length) return "No locations";
  
  if (locations.length === 1) {
    return `Box ${locations[0].box_no}-${locations[0].loc_no}`;
  }
  
  if (locations.length <= 2) {
    return locations.map(l => `${l.box_no}-${l.loc_no}`).join(', ') + ` (${locations.length} locations)`;
  }
  
  return `${locations.length} locations`;
}