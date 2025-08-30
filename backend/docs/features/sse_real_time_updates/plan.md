# Task Management System with SSE Progress Updates - Technical Plan

## Brief Description

Implement a transient task management system that allows background jobs to be started via API endpoints and monitored through Server-Sent Events (SSE) streams. Jobs implement an abstract class with progress reporting capabilities, sending real-time updates to connected clients. When jobs complete, they return structured results and automatically clean up their SSE connections. **All task state is kept in-memory and is intentionally ephemeral - it is acceptable and expected that task state is lost on application restarts.**

## Files to Create

### Task Management Core
- `app/services/task_service.py` - Task management service for running background jobs with SSE progress updates
- `app/services/base_task.py` - Abstract base class for background tasks with progress reporting
- `app/schemas/task_schema.py` - Pydantic schemas for in-memory task status, progress updates, and results
- `app/api/tasks.py` - API endpoints for task SSE streaming (job-specific endpoints out of scope)

### Configuration and Setup
- Add task service to `app/services/container.py` - Dependency injection configuration
- Update `app/__init__.py` - Wire task service into application factory

### Documentation
- `docs/task_system_usage.md` - Technical documentation on how to implement and use background tasks

## Files to Modify

### API Registration
- `app/api/__init__.py` - Register task API blueprint

## Task System Architecture

### Background Task Base Class
Abstract base class that all background jobs must inherit from with an abstract `execute` method that:
- Takes a progress_handle parameter for sending updates to connected clients
- Takes **kwargs for task-specific parameters  
- Returns a Dict[str, Any] result schema DTO to send to client

### Progress Reporting Interface
Handle passed to tasks for sending real-time updates with methods to:
- Send progress text updates to connected clients
- Send progress value updates (0.0 to 1.0) to connected clients
- Send both text and progress value together

### Task Event Types
1. **task_started** - Task execution began
2. **progress_update** - Progress text or value update
3. **task_completed** - Task finished successfully with result
4. **task_failed** - Task failed with error details

## Task Service Architecture

### Task Lifecycle Management
- Generate unique task IDs using UUID4
- Track active tasks in an **in-memory registry** with metadata (status, start time, task instance)
- Per-task SSE connection for progress updates
- Automatic cleanup when tasks complete or fail
- Task timeout handling with configurable limits
- **All task state is transient and lost on application restart**

### Task Execution
- Thread-safe task execution in background threads
- Progress updates sent via SSE to connected clients
- Result collection and delivery upon task completion
- Error handling and failure reporting
- Graceful task cancellation support

### Service Interface
TaskService provides methods to:
- Start a background task and return schema DTO with task ID and SSE stream URL
- Get current status of a task (from in-memory registry only)
- Cancel a running task
- Remove completed task from registry

## API Endpoints

### Task SSE Stream Endpoint
- `GET /api/tasks/{task_id}/stream` - SSE endpoint for monitoring specific task progress
- Returns `text/event-stream` with proper CORS headers
- Automatically closes connection when task completes or fails
- Includes task status and progress updates

### Task Management Endpoints (for reference - implementation details out of scope)
Other API modules will implement task-specific endpoints that:
- Start background tasks using the TaskService
- Return task ID and SSE stream URL to clients
- Allow clients to connect to `/api/tasks/{task_id}/stream` for progress updates

## Implementation Phases

### Phase 1: Task Management Infrastructure
1. Create BaseTask abstract class with progress reporting interface
2. Implement TaskService with task lifecycle management
3. Create schemas for in-memory status tracking and results
4. Create task API endpoints for SSE streaming
5. Add TaskService to dependency injection container
6. Wire task service into application factory
7. Write technical documentation on implementing background tasks
8. Comprehensive testing of task execution, progress updates, and completion

## Dependencies and Service Registration

### Container Configuration
Add task_service as Singleton provider in app/services/container.py (no database dependency required)

### Application Wiring
Wire app.api.tasks module in app/__init__.py alongside existing API modules

### Usage Pattern for Starting Tasks
Other API endpoints will use dependency injection to get TaskService, start background tasks, and directly return the schema DTO from the service (containing task ID and SSE stream URL)

## Testing Strategy

### Unit Tests
- BaseTask abstract class implementation and validation
- TaskService task lifecycle management (start/complete/fail/cancel)
- Progress reporting interface functionality
- Task result collection and cleanup
- Task timeout handling

### Integration Tests  
- End-to-end task execution with SSE progress updates
- Multiple concurrent task execution
- Task completion and automatic connection cleanup
- Error scenarios and task failure handling

### Manual Testing
- Browser EventSource connections to task streams
- Real-time progress updates during task execution
- Connection cleanup when tasks complete
- Performance with multiple concurrent long-running tasks

## Technical Considerations

### Thread Safety
- Use thread-safe data structures for task registry management
- Careful synchronization for task lifecycle state changes
- Thread-safe progress update delivery to SSE streams

### Memory Management
- Automatic cleanup of completed task data and SSE connections
- **No persistent storage** - all task data exists only during execution
- Proper cleanup of background threads when tasks complete or fail
- **Application restart clears all task state** (this is expected behavior)

### Performance
- Lightweight progress update messages to minimize bandwidth
- Efficient task lookup and status tracking
- Background thread pool management for concurrent task execution

### Error Recovery
- Graceful handling of task failures with proper error reporting
- Service-level error isolation (task failures don't affect other tasks or application stability)
- Comprehensive logging for debugging task execution and SSE connection issues
- Task timeout mechanisms to prevent resource leaks from runaway tasks