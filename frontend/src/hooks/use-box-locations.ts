import { useMemo } from 'react';
import { useGetBoxesLocationsByBoxNo } from '@/lib/api/generated/hooks';
import type { LocationWithPartsResponse, LocationDisplayData } from '@/types/locations';

export function useBoxLocationsWithParts(boxNo: number) {
  // Use the generated API hook with query parameters for enhanced data
  // The backend should support this via query parameters based on the plan
  const query = useGetBoxesLocationsByBoxNo(
    { 
      path: { box_no: boxNo },
      query: { include_parts: 'true' }
    },
    { enabled: !!boxNo }
  );

  // Transform API response from snake_case to camelCase domain models
  const transformedData = useMemo((): LocationDisplayData[] | undefined => {
    if (!query.data) return undefined;

    // Handle both old format (basic locations) and new format (enhanced locations)
    return query.data.map((location): LocationDisplayData => {
      // Check if this is the enhanced format with part assignments
      const isEnhancedFormat = 'is_occupied' in location;
      
      if (isEnhancedFormat) {
        const apiLocation = location as LocationWithPartsResponse;
        
        // Calculate total quantity across all part assignments
        const totalQuantity = apiLocation.part_assignments?.reduce((sum, assignment) => sum + assignment.qty, 0) || 0;
        
        // Determine if location is truly occupied
        const isOccupied = Boolean(apiLocation.is_occupied && 
                          apiLocation.part_assignments && 
                          apiLocation.part_assignments.length > 0);
        
        // Generate display text
        const displayText = isOccupied 
          ? `${apiLocation.part_assignments![0].key} ${totalQuantity > 1 ? `(${totalQuantity})` : ''}`.trim()
          : 'Empty';
        
        // Generate styling classes with dark mode support
        const stylingClasses = isOccupied
          ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-800 dark:hover:bg-emerald-700'
          : 'border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700';

        // Transform part assignments to include has_cover_attachment if backend provides it
        const transformedPartAssignments = apiLocation.part_assignments?.map(assignment => ({
          key: assignment.key,
          qty: assignment.qty,
          manufacturer_code: assignment.manufacturer_code,
          description: assignment.description,
          has_cover_attachment: (assignment as { has_cover_attachment?: boolean }).has_cover_attachment,
        })) || null;

        return {
          boxNo: apiLocation.box_no,
          locNo: apiLocation.loc_no,
          isOccupied,
          partAssignments: transformedPartAssignments,
          totalQuantity,
          displayText,
          isEmpty: !isOccupied,
          stylingClasses
        };
      } else {
        // Fallback for old format - treat as empty locations
        return {
          boxNo: location.box_no,
          locNo: location.loc_no,
          isOccupied: false,
          partAssignments: null,
          totalQuantity: 0,
          displayText: 'Empty',
          isEmpty: true,
          stylingClasses: 'border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
        };
      }
    });
  }, [query.data]);

  // Sort locations by loc_no
  const sortedData = useMemo(() => {
    if (!transformedData) return undefined;
    return [...transformedData].sort((a, b) => a.locNo - b.locNo);
  }, [transformedData]);

  return {
    ...query,
    data: sortedData,
    locations: sortedData, // Alias for convenience
  };
}