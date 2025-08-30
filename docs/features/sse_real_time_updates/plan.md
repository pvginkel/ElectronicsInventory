# Server-Sent Events (SSE) Infrastructure - Technical Plan

## Brief Description

Implement the core Server-Sent Events (SSE) infrastructure to enable real-time communication between the backend and frontend clients. This provides the foundational components for streaming events without implementing specific inventory notifications. The implementation will be based on the DHCPApp SSE architecture adapted for the Electronics Inventory backend.

## Files to Create

### Core SSE Implementation
- `app/services/sse_service.py` - SSE service for managing client connections and broadcasting generic events
- `app/models/sse_event.py` - Generic event model for SSE streaming
- `app/schemas/sse_schema.py` - Pydantic schemas for SSE event validation and serialization
- `app/api/sse.py` - API endpoints for SSE streaming

### Configuration and Setup
- Add SSE service to `app/services/container.py` - Dependency injection configuration
- Update `app/__init__.py` - Wire SSE service into application factory

### Documentation
- `docs/sse_api_usage.md` - Technical documentation on how to use the SSE infrastructure

## Files to Modify

### API Registration
- `app/api/__init__.py` - Register SSE blueprint

## Core Event Types

### Infrastructure Event Types
1. **connection_established** - Client connection confirmation
2. **heartbeat** - Keep-alive messages
3. **generic_event** - Flexible event type for future use

### Event Structure
- Generic event model that can accommodate any event type and data payload
- Extensible design for future specific event implementations

## SSE Service Architecture

### Client Connection Management
- Generate unique client IDs using UUID4
- Maintain active connection registry with connection metadata
- Per-client message queues for reliable delivery
- Automatic cleanup of disconnected clients
- Connection heartbeat mechanism (5-second intervals)

### Message Broadcasting
- Thread-safe message queuing to all active clients
- SSE-compliant message formatting with event types, data, and IDs
- Automatic retry logic for failed message deliveries
- Client connection health monitoring

### Service Interface
```python
class SSEService:
    def add_client(self, client_id: str) -> queue.Queue
    def remove_client(self, client_id: str) -> None
    def get_active_connections_count(self) -> int
    def broadcast_event(self, event_type: str, data: Dict[str, Any]) -> None
    def generate_client_id(self) -> str
```

## API Endpoints

### SSE Stream Endpoint
- `GET /api/sse/stream` - Main SSE endpoint for real-time event streaming
- Returns `text/event-stream` with proper CORS headers
- Implements heartbeat and connection management
- Graceful handling of client disconnections

## Implementation Phases

### Phase 1: Core SSE Infrastructure
1. Create SSE service with basic connection management
2. Implement generic event models and schemas  
3. Create SSE API endpoints with connection handling
4. Add SSE service to dependency injection container
5. Wire SSE into application factory
6. Write technical usage documentation
7. Basic testing of connection management and event broadcasting

## Dependencies and Service Registration

### Container Configuration
```python
# In app/services/container.py
sse_service = providers.Singleton(SSEService)
```

### Application Wiring
```python
# In app/__init__.py
container.wire(modules=[
    'app.api.parts', 'app.api.boxes', 'app.api.inventory', 
    'app.api.types', 'app.api.testing', 'app.api.documents',
    'app.api.sse'  # New SSE module
])
```

## Testing Strategy

### Unit Tests
- SSE service client management (add/remove clients)
- Event formatting and serialization
- Message broadcasting to multiple clients
- Connection cleanup on client disconnect

### Integration Tests  
- End-to-end SSE stream functionality
- Multiple client connections and broadcasts
- Error scenarios and connection failures

### Manual Testing
- Browser EventSource connections
- Connection persistence and reconnection
- Performance with multiple concurrent clients

## Technical Considerations

### Thread Safety
- Use thread-safe Queue objects for message passing
- Careful management of shared connection registry
- Proper synchronization for client add/remove operations

### Memory Management
- Automatic cleanup of disconnected client queues
- Bounded queue sizes to prevent memory leaks
- Connection timeout handling

### Performance
- Lightweight event payloads to minimize bandwidth
- Efficient client lookup and message routing
- Heartbeat intervals optimized for connection detection vs overhead

### Error Recovery
- Graceful handling of client disconnections
- Service-level error isolation (SSE failures don't affect application stability)
- Comprehensive logging for debugging connection issues