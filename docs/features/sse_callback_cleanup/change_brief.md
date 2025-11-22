# SSE Callback Cleanup - Change Brief

## Summary

Remove obsolete SSE callback handling code and the unused `connection_open` event from the backend.

## Background

The SSE Gateway previously supported returning a message and close request from connect/disconnect callbacks. This functionality has been removed from the SSE Gateway, making the related handling code in the backend obsolete.

Additionally, the `connection_open` event provides little value and is not used in the frontend.

## Changes Required

1. **Remove callback response handling**: The `handle_callback` function in `app/api/sse.py:98` currently handles responses from connect and disconnect callbacks that include messages and close requests. Since the SSE Gateway now only returns empty responses from these callbacks, this handling code should be removed.

2. **Remove `connection_open` event**: The `connection_open` SSE event should be removed completely as it is not used in the frontend and provides minimal value. The `connection_close` event should be retained as it has utility.

## Functional Description

- Simplify the callback handling in `app/api/sse.py` to expect only empty responses from connect/disconnect callbacks
- Remove all code related to the `connection_open` event
- Retain the `connection_close` event functionality
- Ensure the SSE connection flow continues to work without these features
