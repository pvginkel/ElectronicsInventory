# Backend Requirements: Box Location Data with Part Assignments

## Overview

The frontend box details view needs to display which parts are stored in each location within a storage box. Currently, the API only provides basic location information (box number and location number) without showing what parts are actually stored in each location.

## Current State

When viewing a storage box details page, users see:
- Box information (number, description, capacity, usage statistics) ✅ **Working**
- List of locations within the box ✅ **Working**  
- What parts are stored in each location ❌ **Missing**

All locations currently show "No data" because the API doesn't provide part assignment information.

## Required Functionality

### User Story
As a user viewing a storage box, I want to see which parts are stored in each location so that I can:
- Quickly identify where specific parts are located
- See which locations are truly empty vs occupied
- View the quantity of parts in each location
- Understand the actual usage of my storage space

### Expected Behavior

When viewing box details, each location should display:

**For occupied locations:**
- Part ID (4-letter identifier like "BZQP")
- Quantity of parts in that location
- Visual indication that the location is occupied

**For empty locations:**
- Clear indication that the location is available/empty
- No part information

### Data Requirements

The frontend needs to know, for each location in a box:
- Location number
- Whether it contains parts (occupied/empty status)
- If occupied:
  - Which part(s) are stored there (part ID)
  - How many units of each part
  - Basic part information (for display purposes)

### Business Rules

1. A location can be completely empty
2. A location can contain one type of part with a specific quantity
3. The system should reflect real-time data (if parts are moved, the display should update)
4. Location data should be consistent with the overall box usage statistics already implemented

### Success Criteria

- ✅ User can view box details and immediately see which locations contain parts
- ✅ User can identify empty locations available for new parts
- ✅ Location information matches the box usage statistics (occupied count should align)
- ✅ Data updates when parts are added, moved, or removed from locations

## Current API Gap

The existing APIs provide:
- Box information with usage statistics (working correctly)
- List of locations in a box (returns only location numbers)
- Parts and their overall quantities (working correctly)

Missing:
- Which specific parts are in which specific locations within a box

## Notes for Implementation

- The frontend is already structured to display this information when provided by the API
- No frontend changes are needed once the backend provides the complete location data
- This functionality is essential for the core inventory management workflow