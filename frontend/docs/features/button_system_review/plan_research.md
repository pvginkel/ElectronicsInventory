# Button System Review – Research Plan

## Research Objective
Audit all button labels in the application to identify which ones need to be updated to follow the standardized format: `<verb> <noun>`, business-function oriented, title case.

## Context
Button labels should:
- Follow the format `<verb> <noun>` (e.g., "Order Stock", "Edit List")
- Describe the business function, not the technical operation (so "Order Stock" not "Create Shopping List")
- Use title case (capitalize first letter of all words)
- This applies to all buttons including icon buttons with labels like "+ Add Part"

## Research Tasks

### 1. Find All Button Instances
Search for button components across the application:
- `<Button>` components
- `<button>` elements
- Icon buttons with text labels
- Menu items that act as buttons (e.g., ellipsis menu options)
- Submit buttons in forms
- Action bar buttons

### 2. Document Current Labels
For each button found, record:
- Current label text
- Location (file:line)
- Context (what page/component, what action it performs)
- Business function it serves

### 3. Evaluate Against Standards
For each button, determine:
- **Compliant**: Already follows the format
- **Needs Update**: Doesn't follow format
  - Missing verb
  - Wrong format (e.g., verb only, or "Create X" instead of business function)
  - Wrong case
  - Other issues

### 4. Propose Corrections
For each non-compliant button:
- Suggest a corrected label that follows the standard
- Note if the business function is unclear and needs clarification

## Expected Output

Create a document `docs/features/button_system_review/button_audit.md` with:

1. **Summary Statistics**
   - Total buttons found
   - Compliant count
   - Needs update count
   - Organized by category (action bars, forms, menus, etc.)

2. **Buttons That Need Updates** (primary focus)

Organized by location/feature area:
```
### [Feature Area / Component]

#### [Button Context]
- **Location**: file:line
- **Current label**: "..."
- **Business function**: What it does
- **Proposed label**: "..."
- **Rationale**: Why this change (if not obvious)
```

3. **Compliant Buttons** (brief list for reference)
   - Just count or brief list of examples showing correct patterns

4. **Edge Cases / Questions**
   - Any buttons where the correct label is unclear
   - Special cases that might need different treatment (icon-only buttons, mobile considerations)
   - Questions about business function naming

## Research Method
1. Search for button patterns:
   - `<Button` component usage
   - `type="submit"` or `type="button"`
   - Menu item components
   - Action patterns in UI components
2. For each instance:
   - Extract current label text
   - Identify the action/business function
   - Evaluate against format rules
   - Propose correction if needed
3. Group by feature area for easier review
4. Highlight patterns (e.g., common mistakes, areas that need systematic updates)

## Special Considerations

### Icon + Text Buttons
Example: `"+ Add Part"` on kit BOM table
- Keep the icon ("+") or fold into the verb?
- Recommendation needed

### Icon-Only Buttons
- Document their aria-labels
- Apply same standards?

### Menu Items
- Ellipsis menu options that perform actions
- Should follow same format

## Acceptance Criteria
- All buttons in the application have been found and evaluated
- Non-compliant buttons have clear, actionable correction proposals
- Organized by feature area for efficient implementation
- Edge cases and questions are documented
- Output enables systematic button label updates across the app
