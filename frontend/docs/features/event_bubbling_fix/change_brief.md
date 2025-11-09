# Change Brief: Fix Event Bubbling Issues

## Problem

Multiple dialog/modal interactions are experiencing event bubbling issues where actions on child components trigger unintended actions on parent components:

1. **Link Document Deletion on Part Detail View**: When deleting a link document, after confirming the delete in the dialog, the link is opened (even though the deletion succeeds). The delete confirmation action is bubbling up and triggering the link click.

2. **Inline Seller Creation in Edit Part Screen**: When using the searchable select to create a seller inline, confirming the seller creation dialog also commits the parent part edit form. The seller creation confirmation is bubbling up and triggering the form submission.

## Root Cause

These issues indicate a widespread problem where form submissions or button clicks within dialogs/modals are not properly preventing event propagation, causing the events to bubble up to parent components and trigger unintended actions.

## Solution

Fix the root cause by ensuring that form submissions and button clicks within dialogs properly stop event propagation. This should be addressed at the component level where dialogs and forms are implemented, so the fix applies across all instances.
