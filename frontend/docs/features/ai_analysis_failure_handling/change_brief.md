# Change Brief: AI Analysis Failure Handling

## Overview

The REST API for AI analysis now returns an optional `analysis_failure_reason` field. When this field contains content, the other response fields should be ignored and the system must treat this as the AI being unable to fulfill the request.

## Required Changes

A new AI analysis step must be introduced that:
1. Displays the failure message from `analysis_failure_reason` to the user
2. Allows the user to go back to the first screen to refine their query
3. Properly handles the case where `analysis_failure_reason` is present vs. absent

## Technical Context

- The API JSON document and generated code have already been regenerated with the new field
- This affects the AI analysis workflow in the frontend
- The failure step should integrate seamlessly into the existing step-based AI analysis flow
