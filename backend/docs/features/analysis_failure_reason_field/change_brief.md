# Change Brief: Add analysis_failure_reason Field

## Problem

When the AI-based part analysis receives a query that is too vague or ambiguous to identify a specific part, the LLM currently has no way to communicate the failure reason to the user. This leaves users without helpful context about why the analysis didn't work or what additional information is needed.

## Required Change

Add a new optional field `analysis_failure_reason` to the `PartAnalysisSuggestion` model that allows the LLM to provide a human-readable explanation when analysis fails to identify a part.

This field should:
- Be added to the SQLAlchemy model
- Be included in the Pydantic response schema
- Be returned in the REST API response
- Be optional (nullable) since successful analyses won't have a failure reason

## Expected Behavior

- When analysis succeeds in identifying a part: `analysis_failure_reason` is `null` or not present
- When analysis fails: `analysis_failure_reason` contains a descriptive message explaining what went wrong or what additional information is needed

## Example Scenarios

User query: "10k resistor"
- Analysis fails because the query is too vague
- `analysis_failure_reason`: "Please be more specific - do you need an SMD or through-hole resistor? If SMD, what package size (e.g., 0603, 0805)?"

User query: "unknown blue component"
- Analysis fails because there's insufficient information
- `analysis_failure_reason`: "Unable to identify the part. Please provide a part number, manufacturer code, or more specific description."
