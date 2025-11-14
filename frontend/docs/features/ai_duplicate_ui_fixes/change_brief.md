# AI Duplicate Detection UI Fixes - Change Brief

## Overview

Apply UI/UX improvements to the duplicate detection feature based on user feedback and remove unnecessary failing tests.

## Changes Required

### 1. Remove Failing Tests
- Delete the two error-handling edge case tests from `tests/e2e/parts/ai-parts-duplicates.spec.ts`:
  - "shows error when neither analysis nor duplicates returned"
  - "shows fallback UI when duplicate part fetch fails with 404"

### 2. Duplicate Bar (Review Step) - Redesign Using LinkChip

**Current state**: Horizontal bar with flat inline items showing part key, description, badge, and info icon.

**Required changes**:
- Reuse the `LinkChip` component instead of custom bar item component
- Extend `LinkChip` to support:
  - Info icon (Lucide `Info`) with tooltip showing reasoning
  - Status badge display (for confidence level)
  - Custom icon (use Lucide `Wrench` icon)
- Display part key in the chip label
- Add background color to the panel (currently gray in dark mode - needs color)
- Remove the subtext "These parts may already exist in your inventory..."
- Increase font size of "Potential Duplicates Found" header
- Position duplicate parts to the RIGHT of the label (not below)
- Wrap parts to second line if they don't fit horizontally
- On hover over a part chip, show a popup/tooltip with the full duplicate card (same card as duplicate-only screen)
- Sort duplicates: high confidence first, then medium confidence, then alphabetically by description within each confidence level
- Part chips should show pointer cursor

### 3. Duplicate-Only Screen - Card Size and Layout

**Current state**: Large cards in responsive grid, modal sized to content.

**Required changes**:
- Reduce card width to maximum 180px (reference: `src/components/boxes/location-container.tsx:45`)
- Adjust modal width to fit the smaller cards appropriately
- Apply same sorting as duplicate bar: high confidence → medium confidence → alphabetical by description
- Add padding to the card container to prevent hover animation from causing border clipping (cards have grow animation on hover that currently clips at border)

### 4. Add Cancel Functionality to AI Analysis Workflow

**Current state**: No way to cancel once analysis starts.

**Required changes**:
- Add Cancel button to review step (where duplicate bar shows)
- Add Cancel button to duplicates-only screen
- Add Cancel button to input step (and make "Analyze Part" button regular size)
- Cancel should close the dialog and reset state

## Success Criteria

- Duplicate bar uses LinkChip components with enhanced features
- Duplicate bar shows colored panel with parts on the right of label text
- Hover over part chip shows card popup
- Duplicate-only screen has 180px max width cards with proper padding
- Both screens sort duplicates correctly (confidence then description)
- Cancel buttons present and functional in all AI workflow steps
- Two unnecessary tests removed
- All existing passing tests continue to pass
