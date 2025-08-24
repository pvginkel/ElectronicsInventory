interface Location {
  boxNo: number;
  locNo: number;
  quantity?: number;
}

export function formatLocation(boxNo: number, locNo: number): string {
  return `${boxNo}-${locNo}`;
}

export function parseLocation(locationString: string): { boxNo: number; locNo: number } | null {
  const match = locationString.match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  
  return {
    boxNo: parseInt(match[1], 10),
    locNo: parseInt(match[2], 10),
  };
}

export function calculateTotalQuantity(locations: Location[]): number {
  return locations.reduce((total, location) => total + (location.quantity || 0), 0);
}

// This function is a placeholder for future implementation with API integration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function suggestLocation(_typeId: number): Promise<{ boxNo: number; locNo: number } | null> {
  // This will be implemented with the API hook when we integrate it
  // For now, return null as a placeholder
  return null;
}