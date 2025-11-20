# Version Stream Testing Support Issue

## Problem

The deployment banner test (`tests/e2e/deployment/deployment-banner.spec.ts`) is failing when attempting to trigger version events for testing purposes.

**Test failure location:** Line 52
```typescript
const baselineResponse = await page.request.post(`${backendUrl}/api/testing/deployments/version`, {
  data: {
    request_id: requestId,
    version: baselineVersion,
  },
});

expect(baselineResponse.ok()).toBeTruthy(); // ❌ FAILS - returns error
```

**Error:** The backend endpoint `/api/testing/deployments/version` is not working.

## Root Cause

The backend's `VersionService` was completely refactored during the SSE Gateway integration to be **stateless**. The old implementation had:

- Connection tracking and subscriber management
- Event queuing via `queue_version_event()` method
- Active connection state management

The new implementation (`app/services/version_service.py`):

```python
class VersionService:
    """Service for providing frontend version information via SSE Gateway.

    This is a stateless service that returns version data on demand.
    No connection tracking, no subscriber management, no idle timeout.

    When SSE Gateway calls the connect callback, this service returns
    the current version in the callback response, then ignores the connection.
    """

    def __init__(self, settings: Settings):
        self.settings = settings

    def fetch_frontend_version(self) -> str:
        """Fetch version.json from frontend."""
        ...

    def get_version_info(self) -> SSECallbackResponseSchema:
        """Get current version info as SSE Gateway callback response."""
        ...
```

**Missing:** The `queue_version_event()` method that the testing endpoint depends on.

## Current Testing Endpoint Code

In `app/api/testing.py`:

```python
@testing_bp.route("/deployments/version", methods=["POST"])
@api.validate(json=DeploymentTriggerRequestSchema, resp=SpectreeResponse(HTTP_202=DeploymentTriggerResponseSchema))
@handle_api_errors
@inject
def trigger_version_deployment(
    version_service=Provide[ServiceContainer.version_service]
):
    """Trigger a deterministic version deployment notification for Playwright."""
    payload = DeploymentTriggerRequestSchema.model_validate(request.get_json() or {})

    delivered = version_service.queue_version_event(  # ❌ This method no longer exists
        request_id=payload.request_id,
        version=payload.version,
        changelog=payload.changelog,
    )
    ...
```

## What Needs to Be Fixed (Backend)

The testing endpoint needs to be reimplemented to work with the new SSE Gateway architecture:

### Option 1: Direct SSE Gateway Client Approach

Use `SSEGatewayClient` to send events directly to the gateway:

```python
@testing_bp.route("/deployments/version", methods=["POST"])
@inject
def trigger_version_deployment(
    sse_coordinator=Provide[ServiceContainer.sse_coordinator_service],
    sse_gateway_client=Provide[ServiceContainer.sse_gateway_client]
):
    """Trigger a deterministic version deployment notification for Playwright."""
    payload = DeploymentTriggerRequestSchema.model_validate(request.get_json() or {})

    # Need to:
    # 1. Look up the connection token for the request_id
    # 2. Send event via SSE Gateway client

    # Problem: SSECoordinatorService doesn't track version stream connections
    # (only task streams are tracked per the architecture)
```

**Blocker:** The `SSECoordinatorService` explicitly does NOT track version stream connections:

```python
# app/services/sse_coordinator_service.py
class SSECoordinatorService:
    """
    Only task streams are tracked for connection management; version streams
    respond with initial data and ignore the connection afterward.
    """
```

### Option 2: Add Connection Tracking for Testing

Modify `SSECoordinatorService` to optionally track version stream connections when a `request_id` is present:

```python
def _handle_version_connect(self, token: str, url: str, version_service: Any):
    """Handle version stream connect callback."""
    # Extract request_id from query string if present
    parsed_url = urlparse(url)
    query_params = parse_qs(parsed_url.query)
    request_id = query_params.get('request_id', [None])[0]

    if request_id:
        # Track connection for testing purposes
        with self._lock:
            self._version_test_connections[request_id] = token

    # Return version info as immediate callback response
    return (200, version_service.get_version_info())

def send_version_event(self, request_id: str, version: str) -> bool:
    """Send version event to a tracked test connection (testing only)."""
    with self._lock:
        token = self._version_test_connections.get(request_id)
        if not token:
            return False

    # Send event via SSE Gateway client
    event_data = json.dumps({"version": version, "correlationId": request_id})
    return self.sse_gateway_client.send_event(
        token=token,
        event_name="version",
        data=event_data
    )
```

Then update the testing endpoint:

```python
@testing_bp.route("/deployments/version", methods=["POST"])
@inject
def trigger_version_deployment(
    sse_coordinator=Provide[ServiceContainer.sse_coordinator_service]
):
    """Trigger a deterministic version deployment notification for Playwright."""
    payload = DeploymentTriggerRequestSchema.model_validate(request.get_json() or {})

    delivered = sse_coordinator.send_version_event(
        request_id=payload.request_id,
        version=payload.version
    )

    status = "delivered" if delivered else "queued"
    return jsonify({"requestId": payload.request_id, "delivered": delivered, "status": status}), 202
```

### Option 3: SSE Gateway Testing API

Add a testing endpoint to the SSE Gateway itself that allows sending events by URL pattern:

```typescript
// ssegateway: POST /internal/testing/send-by-url
{
  "url_pattern": "/api/sse/utils/version?request_id=abc123",
  "event": "version",
  "data": {"version": "test-version", "correlationId": "abc123"}
}
```

The gateway would find all connections matching the URL pattern and send the event.

## Frontend SSE Integration Status

✅ **The frontend SSE Gateway integration is working correctly.**

Evidence from test logs:
```
[INFO] New SSE connection: token=000599ef-c9bd-4eb2-ba33-85c0a4c1644f url=/api/sse/utils/version?request_id=...
[INFO] connect callback succeeded: token=... status=200
```

The connection establishes successfully. The test failure is purely due to the backend testing endpoint being incompatible with the new SSE Gateway architecture.

## Files Modified (Frontend)

1. `vite.config.ts` - Updated proxy from `/sse` to `/api/sse` (no path rewriting)
2. `src/hooks/use-version-sse.ts` - Changed connection URL from `/api/utils/version/stream` to `/api/sse/utils/version`
3. `.env.test` - Fixed gateway path from `../../SSEGateway` to `../ssegateway`

## Recommendation

**Backend team should implement Option 2** (Add Connection Tracking for Testing) as it:
- Preserves the stateless architecture for production use
- Adds minimal testing-specific tracking (only when `request_id` is present)
- Follows the established pattern of using SSE Gateway client to send events
- Keeps all SSE-related logic centralized in `SSECoordinatorService`

## Related Documentation

- Backend SSE Gateway integration plan: `/work/backend/docs/features/sse_gateway_integration/plan_execution_report.md`
- Backend VersionService implementation: `/work/backend/app/services/version_service.py`
- Backend SSECoordinatorService: `/work/backend/app/services/sse_coordinator_service.py`
- Frontend test: `/work/frontend/tests/e2e/deployment/deployment-banner.spec.ts`
