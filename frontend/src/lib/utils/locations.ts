interface Location {
  boxNo: number;
  locNo: number;
  quantity?: number;
}

export function formatLocation(boxNo: number, locNo: number): string {
  return `${boxNo}-${locNo}`;
}

export function calculateTotalQuantity(locations: Location[]): number {
  return locations.reduce((total, location) => total + (location.quantity || 0), 0);
}