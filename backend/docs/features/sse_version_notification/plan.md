# SSE Version Notification Infrastructure

## Description

Infrastructure utility to replace the current frontend polling mechanism for version changes with a Server-Sent Events (SSE) endpoint. This is a utility/infrastructure feature (not business logic) that provides real-time version updates to the frontend. The SSE endpoint fetches the frontend's version.json file once at connection start, sends it to the client, and maintains the connection with heartbeats. When the pod reloads with a new version, the SSE connection drops, forcing the client to reconnect and receive the updated version. The endpoint integrates with the graceful shutdown coordinator to cleanly terminate connections during pod shutdown.

## Technical Implementation

### Files to Create

1. **`app/api/utils.py`**
   - Infrastructure API module for utility endpoints
   - Blueprint: `utils_bp` with prefix `/utils`
   - Endpoint: `/version/stream` (GET) - SSE stream for version notifications (full path: `/api/utils/version/stream` after Flask prefix)
   - Integrates with shutdown coordinator to close SSE on PREPARE_SHUTDOWN
   - Uses shared SSE utility functions

2. **`app/services/version_service.py`**
   - Dedicated service for version-related infrastructure operations
   - New service class `VersionService(BaseService)` 
   - Method: `fetch_frontend_version()` - fetches version.json from frontend
   - Uses `requests` or `urllib` to GET the configured URL
   - Returns the raw JSON content as a string
   - Receives shutdown coordinator via dependency injection

3. **`app/utils/sse_utils.py`**
   - Shared SSE utility functions for both tasks and version endpoints
   - `create_sse_response()` - creates Response with standard SSE headers
   - `format_sse_event()` - formats event name and data into SSE format
   - `SSE_HEARTBEAT_INTERVAL` - shared heartbeat interval configuration

4. **`tests/test_utils_api.py`**
   - Tests for infrastructure utility endpoints
   - Tests for SSE version stream endpoint behavior
   - Mock version fetching
   - Test SSE event generation
   - Test shutdown integration

5. **`tests/test_version_service.py`**
   - Tests for version service methods
   - Tests for version fetching logic
   - Mock HTTP requests to frontend

### Files to Modify

1. **`app/services/container.py`**
   - Add `version_service` factory provider with shutdown coordinator dependency
   - Wire to utils API module

2. **`app/__init__.py`**
   - Register utils blueprint with `/utils` prefix
   - Add `app.api.utils` to container wiring modules list

3. **`app/config.py`**
   - Add `FRONTEND_VERSION_URL` setting (default: "http://localhost:3000/version.json")
   - Add `SSE_HEARTBEAT_INTERVAL` setting (default: 5 for development, 30 for production)

4. **`app/api/tasks.py`**
   - Refactor to use shared SSE utilities from `app/utils/sse_utils.py`
   - Use shared `SSE_HEARTBEAT_INTERVAL` configuration

### Algorithm

1. **SSE Connection Flow:**
   ```
   Client connects to /api/utils/version/stream
   (Full URL with /api prefix applied by Flask)
   ↓
   Server fetches FRONTEND_VERSION_URL
   ↓
   Server sends initial version event:
     event: version
     data: {"version": "1.0.0", "buildTime": "..."}
   ↓
   Server enters heartbeat loop:
     - Check shutdown coordinator state
     - If shutting down, close connection
     - Every SSE_HEARTBEAT_INTERVAL seconds send:
       event: keepalive
       data: {}
   ↓
   Connection maintained until:
     - Pod restarts (connection drops)
     - PREPARE_SHUTDOWN event (graceful close)
   ```

2. **Version Fetching:**
   - Use HTTP GET to fetch `FRONTEND_VERSION_URL` from config
   - No startup validation of URL (frontend container may not be ready yet)
   - Connection timeout: 5 seconds (hardcoded in service)
   - If fetch fails: send error event to client and close SSE stream immediately
   - Client is responsible for retry logic on connection failure
   - Cache version content for the duration of the SSE connection

3. **Shutdown Integration:**
   - Register lifetime notification callback with shutdown coordinator
   - On PREPARE_SHUTDOWN event:
     - Set shutdown flag to break heartbeat loop
     - Send final event indicating shutdown
     - Close SSE connection gracefully
   - This ensures clients disconnect cleanly before pod termination

4. **SSE Event Format:**
   - Initial version event:
     ```
     event: version
     data: {"version": "1.0.0", "buildTime": "2024-01-01T00:00:00Z"}
     ```
   - Keepalive events:
     ```
     event: keepalive
     data: {}
     ```
   - Error event (if version fetch fails, then close connection):
     ```
     event: error
     data: {"error": "Failed to fetch version"}
     ```
   - Shutdown event:
     ```
     event: shutdown
     data: {"message": "Server shutting down"}
     ```

5. **Shared SSE Utilities:**
   - `format_sse_event(event: str, data: dict | str) -> str`:
     ```python
     if isinstance(data, dict):
         data = json.dumps(data)
     return f"event: {event}\ndata: {data}\n\n"
     ```
   - `create_sse_response(generator) -> Response`:
     ```python
     return Response(
         generator,
         mimetype="text/event-stream",
         headers={
             "Cache-Control": "no-cache",
             "Access-Control-Allow-Origin": "*",
             "Access-Control-Allow-Headers": "Cache-Control"
         }
     )
     ```

### Implementation Details

**Version Service Pattern:**
```python
class VersionService(BaseService):
    def __init__(self, db: Session, settings: Settings, 
                 shutdown_coordinator: ShutdownCoordinatorProtocol):
        super().__init__(db)
        self.settings = settings
        self.shutdown_coordinator = shutdown_coordinator
        
    def fetch_frontend_version(self) -> str:
        """Fetch version.json from frontend service"""
        url = self.settings.FRONTEND_VERSION_URL
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.text
```

**SSE Endpoint Pattern with Shutdown Integration:**
```python
from app.utils.sse_utils import create_sse_response, format_sse_event, SSE_HEARTBEAT_INTERVAL

@utils_bp.route("/version/stream", methods=["GET"])
@handle_api_errors
@inject
def version_stream(
    version_service=Provide[ServiceContainer.version_service],
    shutdown_coordinator=Provide[ServiceContainer.shutdown_coordinator],
    settings=Provide[ServiceContainer.config]
):
    """SSE stream for frontend version notifications - infrastructure utility endpoint"""
    def generate_events():
        shutdown_flag = threading.Event()
        
        # Register shutdown handler
        def on_lifetime_event(event: LifetimeEvent):
            if event == LifetimeEvent.PREPARE_SHUTDOWN:
                shutdown_flag.set()
        
        shutdown_coordinator.register_lifetime_notification(on_lifetime_event)
        
        # Fetch version once at start
        try:
            version_json = version_service.fetch_frontend_version()
            yield format_sse_event("version", version_json)
        except Exception as e:
            yield format_sse_event("error", {"error": str(e)})
            return
            
        # Keepalive loop with shutdown check
        heartbeat_interval = settings.SSE_HEARTBEAT_INTERVAL
        while not shutdown_flag.wait(heartbeat_interval):
            yield format_sse_event("keepalive", {})
            
        # Send shutdown event before closing
        yield format_sse_event("shutdown", {"message": "Server shutting down"})
            
    return create_sse_response(generate_events())
```

**Configuration Settings:**
```python
# In app/config.py
FRONTEND_VERSION_URL: str = Field(
    default="http://localhost:3000/version.json",
    description="URL to fetch frontend version information"
)

SSE_HEARTBEAT_INTERVAL: int = Field(
    default=5 if FLASK_ENV == "development" else 30,
    description="SSE heartbeat interval in seconds"
)
```

### Testing Strategy

1. **Service Tests:**
   - Test successful version fetch with configured URL
   - Test handling of HTTP errors (404, 500)
   - Test timeout handling
   - Mock requests to frontend
   - Test shutdown coordinator integration

2. **API Tests:**
   - Test SSE stream generation
   - Test initial version event format
   - Test keepalive events with configurable interval
   - Test error event on fetch failure
   - Test graceful shutdown on PREPARE_SHUTDOWN event
   - Mock version service and shutdown coordinator
   - Verify shutdown event is sent before connection closes

3. **Integration Tests:**
   - Test full flow with mocked frontend server
   - Verify SSE event formatting
   - Test connection persistence
   - Test shutdown sequence with actual coordinator

4. **Shared Utilities Tests:**
   - Test `format_sse_event` with dict and string data
   - Test `create_sse_response` headers and content type
   - Verify consistent behavior between tasks and version SSE

### Notes

- **Infrastructure endpoint:** This is clearly separated from business logic under `/utils` (full path `/api/utils` after Flask prefix) to indicate it's a utility/infrastructure feature, not part of the core inventory business domain
- The heartbeat interval is configurable: 5 seconds for development, 30 for production
- No need to track version changes after initial fetch - pod restart handles updates
- **Error handling strategy:** If version fetch fails, the SSE connection closes with an error event. The frontend client is responsible for implementing retry logic
- **No URL validation on startup:** The frontend container may not be ready when the backend starts. This is expected behavior in the pod environment
- Frontend will need to handle reconnection logic when SSE connection drops, receives shutdown event, or receives an error event
- Requests library is already a project dependency (used in existing services)
- The service should be a factory (not singleton) since it uses the database session
- Shutdown integration ensures clients disconnect cleanly during graceful shutdown, allowing them to reconnect to the new instance
- Shared SSE utilities reduce code duplication between tasks and version endpoints
- The `/utils` namespace is reserved for infrastructure and utility endpoints that are not part of the core business logic