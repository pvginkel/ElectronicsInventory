# Change Brief: AI Analysis Warning Display

## Overview

The AI analysis API can return both `analysis_failure_reason` and `analysis_result` simultaneously. This indicates that the LLM had trouble with the input but was still able to produce a partial analysis result.

## Current Behavior

When `analysis_failure_reason` is present, the system treats it as a hard error and displays the error UI on the progress step, preventing the user from seeing any analysis results that may also be present.

## Required Change

Change the implementation to differentiate between two scenarios:

1. **Failure reason + analysis result both present**: Show the analysis result in the review step, but display a warning bar at the top indicating the LLM had trouble with the input. The warning bar should show the `analysis_failure_reason` message.

2. **Only failure reason present (no analysis result)**: Continue to show the error UI on the progress step as currently implemented.

## Technical Context

- The current implementation is in the most recent git commit
- The hook routing logic in `src/hooks/use-ai-part-analysis.ts` currently prioritizes failure reason and routes to error
- The review step component will need a new warning bar component or pattern
- The failure reason detection logic needs to be updated to check for the presence of analysis results before routing to error
