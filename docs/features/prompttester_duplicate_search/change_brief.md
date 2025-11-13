# Change Brief: Implement Duplicate Search in Prompt Tester

## Overview
Implement the missing `run_duplicate_search_tests()` function in the prompt tester tool to enable testing of duplicate detection functionality.

## Requirements

1. **Implement `run_duplicate_search_tests()` function**
   - Accept a list of queries with expected results (query string, list of (part_key, confidence) tuples)
   - Call the duplicate search AI logic to detect duplicates
   - Follow the existing pattern used by `run_full_tests()` and `single_run()`
   - Use the duplicate search prompt template and logic from `DuplicateSearchService`
   - Do NOT include metrics tracking (this is a standalone testing tool)

2. **Add duplicate search function to `run_full_tests()`**
   - Update `run_full_tests()` to also have access to duplicate search function calling
   - Allow the full analysis to use duplicate detection when available
   - Follow the pattern of how `url_classifier` is currently passed through

## Key Implementation Details

- Copy the duplicate search prompt from `app/services/prompts/duplicate_search.md` into the prompt tester
- Use the schema definitions from `app/schemas/duplicate_search.py` (DuplicateMatchLLMResponse)
- Follow the code pattern in `DuplicateSearchService::search_duplicates()` but without metrics
- Build a test inventory dataset for duplicate search testing
- Output results to files following the existing pattern (JSON, TXT, LOG)

## Expected Behavior

After implementation:
- Running `duplicate_search_tests()` should execute AI-powered duplicate detection
- Results should be saved to output files for manual review
- Full analysis tests can optionally use duplicate detection function calling
