"""Testing SSE and task endpoints for Playwright test suite support."""

from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request
from spectree import Response as SpectreeResponse

from app.schemas.task_schema import TaskEvent, TaskEventType
from app.schemas.testing_sse import (
    DeploymentTriggerRequestSchema,
    DeploymentTriggerResponseSchema,
    TaskEventRequestSchema,
    TaskEventResponseSchema,
    TestErrorResponseSchema,
)
from app.services.container import ServiceContainer
from app.services.frontend_version_service import FrontendVersionService
from app.services.sse_connection_manager import SSEConnectionManager
from app.services.task_service import TaskService
from app.utils.spectree_config import api

testing_sse_bp = Blueprint("testing_sse", __name__, url_prefix="/api/testing")


@testing_sse_bp.before_request
def check_testing_mode() -> Any:
    """Reject requests when the server is not running in testing mode."""
    from app.api.testing_guard import reject_if_not_testing
    return reject_if_not_testing()


@testing_sse_bp.route("/deployments/version", methods=["POST"])
@api.validate(json=DeploymentTriggerRequestSchema, resp=SpectreeResponse(HTTP_202=DeploymentTriggerResponseSchema))
@inject
def trigger_version_deployment(
    version_service: FrontendVersionService = Provide[ServiceContainer.frontend_version_service]
) -> Any:
    """Trigger a deterministic version deployment notification for Playwright."""
    payload = DeploymentTriggerRequestSchema.model_validate(request.get_json() or {})

    delivered = version_service.queue_version_event(
        request_id=payload.request_id,
        version=payload.version,
        changelog=payload.changelog,
    )

    status = "delivered" if delivered else "queued"
    response_body = DeploymentTriggerResponseSchema(
        requestId=payload.request_id,
        delivered=delivered,
        status=status,
    )

    return jsonify(response_body.model_dump(by_alias=True)), 202


@testing_sse_bp.route("/tasks/start", methods=["POST"])
@inject
def start_test_task(
    task_service: TaskService = Provide[ServiceContainer.task_service]
) -> Any:
    """Start a test task for SSE baseline testing.

    Request body:
        {
            "task_type": "demo_task" | "failing_task",
            "params": { ... task-specific parameters ... }
        }

    Returns:
        200: Task started successfully with task_id and status
    """
    from app.services.base_task import BaseTask
    from tests.test_tasks.test_task import DemoTask, FailingTask

    data = request.get_json() or {}
    task_type = data.get("task_type")
    params = data.get("params", {})

    # Create task instance based on type
    task: BaseTask
    if task_type == "demo_task":
        task = DemoTask()
    elif task_type == "failing_task":
        task = FailingTask()
    else:
        return jsonify({"error": f"Unknown task type: {task_type}"}), 400

    # Start the task
    response = task_service.start_task(task, **params)

    return jsonify({
        "task_id": response.task_id,
        "status": response.status.value
    }), 200


# Map string event types to TaskEventType enum
_EVENT_TYPE_MAP = {
    "task_started": TaskEventType.TASK_STARTED,
    "progress_update": TaskEventType.PROGRESS_UPDATE,
    "task_completed": TaskEventType.TASK_COMPLETED,
    "task_failed": TaskEventType.TASK_FAILED,
}


@testing_sse_bp.route("/sse/task-event", methods=["POST"])
@api.validate(json=TaskEventRequestSchema, resp=SpectreeResponse(HTTP_200=TaskEventResponseSchema, HTTP_400=TestErrorResponseSchema))
@inject
def send_task_event(
    sse_connection_manager: SSEConnectionManager = Provide[ServiceContainer.sse_connection_manager]
) -> Any:
    """Send a fake task event to a specific SSE connection for Playwright testing.

    This endpoint allows the Playwright test suite to simulate task events
    without running actual background tasks. The event is sent directly to
    the SSE connection identified by request_id.

    Returns:
        200: Event sent successfully
        400: No connection exists for the given request_id
    """
    payload = TaskEventRequestSchema.model_validate(request.get_json() or {})

    # Check if connection exists
    if not sse_connection_manager.has_connection(payload.request_id):
        return jsonify({
            "error": f"No SSE connection registered for request_id: {payload.request_id}",
            "status": "not_found"
        }), 400

    # Build TaskEvent with proper format (same as TaskService sends)
    event = TaskEvent(
        event_type=_EVENT_TYPE_MAP[payload.event_type],
        task_id=payload.task_id,
        data=payload.data
    )

    # Send event to the specific connection
    # Use mode='json' to serialize datetime to ISO format string
    success = sse_connection_manager.send_event(
        payload.request_id,
        event.model_dump(mode='json'),
        event_name="task_event",
        service_type="task"
    )

    if not success:
        return jsonify({
            "error": f"Failed to send event to connection: {payload.request_id}",
            "status": "send_failed"
        }), 400

    response_body = TaskEventResponseSchema(
        requestId=payload.request_id,
        taskId=payload.task_id,
        eventType=payload.event_type,
        delivered=True
    )

    return jsonify(response_body.model_dump(by_alias=True)), 200
