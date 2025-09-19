from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify

from app.services.container import ServiceContainer
from app.utils import get_current_correlation_id
from app.utils.error_handling import handle_api_errors
from app.utils.sse_utils import create_sse_response, format_sse_event

tasks_bp = Blueprint("tasks", __name__, url_prefix="/tasks")


@tasks_bp.route("/<task_id>/stream", methods=["GET"])
@handle_api_errors
@inject
def get_task_stream(task_id: str, task_service=Provide[ServiceContainer.task_service]):
    """
    SSE endpoint for monitoring specific task progress.

    Returns:
        Server-Sent Events stream with task progress updates
    """
    def generate_events():
        """Generate SSE events for the task."""
        correlation_id = get_current_correlation_id()

        # Send connection_open event
        yield format_sse_event("connection_open", {"status": "connected"}, correlation_id)

        # Check if task exists
        task_info = task_service.get_task_status(task_id)
        if not task_info:
            # Send error event and close
            yield format_sse_event("error", {"error": "Task not found"}, correlation_id)
            yield format_sse_event("connection_close", {"reason": "task_not_found"}, correlation_id)
            return

        # Stream task events
        try:
            while True:
                # Low heartbeat interval because SSE connections aren't aborted
                # with waitress.
                events = task_service.get_task_events(task_id, timeout=5.0)

                if not events:
                    # Send heartbeat event instead of raw keepalive
                    yield format_sse_event("heartbeat", {"timestamp": task_service.get_current_time()}, correlation_id)
                    continue

                for event in events:
                    event_data = {
                        "event_type": event.event_type.value,
                        "task_id": event.task_id,
                        "timestamp": event.timestamp.isoformat(),
                        "data": event.data
                    }

                    yield format_sse_event("task_event", event_data, correlation_id)

                    # Close connection after completion/failure events
                    if event.event_type.value in ["task_completed", "task_failed"]:
                        yield format_sse_event("connection_close", {"reason": "task_completed"}, correlation_id)
                        return
        except GeneratorExit:
            # Client disconnected
            yield format_sse_event("connection_close", {"reason": "client_disconnect"}, correlation_id)

    return create_sse_response(generate_events())


@tasks_bp.route("/<task_id>/status", methods=["GET"])
@handle_api_errors
@inject
def get_task_status(task_id: str, task_service=Provide[ServiceContainer.task_service]):
    """
    Get current status of a task.

    Returns:
        JSON with current task status information
    """
    task_info = task_service.get_task_status(task_id)
    if not task_info:
        return jsonify({"error": "Task not found"}), 404

    return jsonify(task_info.model_dump())


@tasks_bp.route("/<task_id>/cancel", methods=["POST"])
@handle_api_errors
@inject
def cancel_task(task_id: str, task_service=Provide[ServiceContainer.task_service]):
    """
    Cancel a running task.

    Returns:
        JSON with cancellation result
    """
    success = task_service.cancel_task(task_id)
    if not success:
        return jsonify({"error": "Task not found or cannot be cancelled"}), 404

    return jsonify({"success": True, "message": "Task cancellation requested"})


@tasks_bp.route("/<task_id>", methods=["DELETE"])
@handle_api_errors
@inject
def remove_task(task_id: str, task_service=Provide[ServiceContainer.task_service]):
    """
    Remove a completed task from registry.

    Returns:
        JSON with removal result
    """
    success = task_service.remove_completed_task(task_id)
    if not success:
        return jsonify({"error": "Task not found or not completed"}), 404

    return jsonify({"success": True, "message": "Task removed from registry"})
