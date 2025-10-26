# Toast System Improvements – Research Plan

## Research Objective
Identify all success toast messages in the application and evaluate which are good candidates for adding an "undo" button functionality.

## Context
Currently, at least one success toast has an undo button. The user wants to expand this pattern to other appropriate actions but needs to review a list of candidates to decide which ones to implement.

## Research Tasks

### 1. Find All Success Toast Instances
- Search the codebase for all success toast invocations
- Identify the action/context that triggers each toast
- Document the toast message content

### 2. Identify Current Undo Implementation
- Find the existing toast with undo button
- Document its implementation pattern
- Note the action it undoes and how the undo mechanism works

### 3. Categorize Toast Candidates
For each success toast found, evaluate:
- **Action type**: What user action triggered this toast?
- **Reversibility**: Is the action inherently reversible?
- **Impact**: What would undoing this action accomplish?
- **Technical feasibility**: How complex would undo implementation be?
- **User value**: Would users benefit from being able to undo this action?

### 4. Filter Out Non-Candidates
Exclude toasts that:
- Represent read-only operations (e.g., "Data refreshed")
- Are informational only (e.g., "Export started")
- Cannot be meaningfully undone (e.g., confirmations of irreversible actions)
- Already have other undo mechanisms in the UI

## Expected Output

Create a document `docs/features/toast_system_improvements/undo_candidates.md` with:

1. **Current Undo Implementation**
   - Location (file:line)
   - Action it undoes
   - Implementation pattern

2. **Candidate List** (organized by feasibility/value)
   - High Priority: High value, straightforward to implement
   - Medium Priority: Good value but more complex
   - Low Priority / Consider Later: Marginal value or high complexity

For each candidate:
```
### [Action Name]
- **Location**: file:line
- **Toast message**: "..."
- **Action**: What the user did
- **Undo would**: What undoing accomplishes
- **Implementation notes**: Brief technical sketch
- **User value**: Why users would benefit
```

3. **Non-Candidates** (with justification)
   - Brief list of toasts found but excluded, with reason

## Research Method
1. Search for toast invocations: `toast.success`, `toast(`, success toast patterns
2. Read each callsite to understand context
3. Trace back to user action that triggered the toast
4. Evaluate against criteria above
5. Organize findings into output document

## Acceptance Criteria
- All success toasts in the application have been found and evaluated
- Current undo implementation is documented
- Candidates are prioritized with clear rationale
- Output document enables the user to make informed decisions about which undos to implement
