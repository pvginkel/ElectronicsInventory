from typing import Any

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify

from app.services.container import ServiceContainer
from app.services.task_service import TaskService
from app.utils.error_handling import handle_api_errors

tasks_bp = Blueprint("tasks", __name__, url_prefix="/tasks")


@tasks_bp.route("/<task_id>/status", methods=["GET"])
@handle_api_errors
@inject
def get_task_status(task_id: str, task_service: TaskService = Provide[ServiceContainer.task_service]) -> Any:
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
def cancel_task(task_id: str, task_service: TaskService = Provide[ServiceContainer.task_service]) -> Any:
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
def remove_task(task_id: str, task_service: TaskService = Provide[ServiceContainer.task_service]) -> Any:
    """
    Remove a completed task from registry.

    Returns:
        JSON with removal result
    """
    success = task_service.remove_completed_task(task_id)
    if not success:
        return jsonify({"error": "Task not found or not completed"}), 404

    return jsonify({"success": True, "message": "Task removed from registry"})
