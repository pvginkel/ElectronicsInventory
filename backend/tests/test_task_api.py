"""Tests for task API endpoints."""

import time
from unittest.mock import Mock

import pytest
from sqlalchemy.orm import Session

from app.schemas.task_schema import TaskInfo, TaskStatus
from app.services.task_service import TaskService
from tests.test_tasks.test_task import DemoTask
from tests.testing_utils import StubShutdownCoordinator


class TestTaskAPI:
    """Test task API endpoints."""

    @pytest.fixture
    def task_service_mock(self):
        """Create mock TaskService for testing."""
        return Mock(spec=TaskService)

    def test_get_task_status_success(self, client, app, task_service_mock):
        """Test successful get task status endpoint."""
        task_id = "test-task-id"

        task_info = TaskInfo(
            task_id=task_id,
            status=TaskStatus.COMPLETED,
            start_time="2023-01-01T00:00:00",
            end_time="2023-01-01T00:01:00",
            result={"success": True}
        )
        task_service_mock.get_task_status.return_value = task_info

        with app.app_context():
            app.container.task_service.override(task_service_mock)

            response = client.get(f'/api/tasks/{task_id}/status')

            assert response.status_code == 200
            data = response.get_json()
            assert data['task_id'] == task_id
            assert data['status'] == TaskStatus.COMPLETED.value
            assert data['result'] == {"success": True}

    def test_get_task_status_not_found(self, client, app, task_service_mock):
        """Test get task status for nonexistent task."""
        task_id = "nonexistent-task-id"
        task_service_mock.get_task_status.return_value = None

        with app.app_context():
            app.container.task_service.override(task_service_mock)

            response = client.get(f'/api/tasks/{task_id}/status')

            assert response.status_code == 404
            data = response.get_json()
            assert data['error'] == 'Task not found'

    def test_cancel_task_success(self, client, app, task_service_mock):
        """Test successful task cancellation."""
        task_id = "test-task-id"
        task_service_mock.cancel_task.return_value = True

        with app.app_context():
            app.container.task_service.override(task_service_mock)

            response = client.post(f'/api/tasks/{task_id}/cancel')

            assert response.status_code == 200
            data = response.get_json()
            assert data['success'] is True
            assert 'cancellation requested' in data['message']

            task_service_mock.cancel_task.assert_called_once_with(task_id)

    def test_cancel_task_not_found(self, client, app, task_service_mock):
        """Test cancelling nonexistent task."""
        task_id = "nonexistent-task-id"
        task_service_mock.cancel_task.return_value = False

        with app.app_context():
            app.container.task_service.override(task_service_mock)

            response = client.post(f'/api/tasks/{task_id}/cancel')

            assert response.status_code == 404
            data = response.get_json()
            assert data['error'] == 'Task not found or cannot be cancelled'

    def test_remove_task_success(self, client, app, task_service_mock):
        """Test successful task removal."""
        task_id = "test-task-id"
        task_service_mock.remove_completed_task.return_value = True

        with app.app_context():
            app.container.task_service.override(task_service_mock)

            response = client.delete(f'/api/tasks/{task_id}')

            assert response.status_code == 200
            data = response.get_json()
            assert data['success'] is True
            assert 'removed from registry' in data['message']

            task_service_mock.remove_completed_task.assert_called_once_with(task_id)

    def test_remove_task_not_found(self, client, app, task_service_mock):
        """Test removing nonexistent or active task."""
        task_id = "nonexistent-task-id"
        task_service_mock.remove_completed_task.return_value = False

        with app.app_context():
            app.container.task_service.override(task_service_mock)

            response = client.delete(f'/api/tasks/{task_id}')

            assert response.status_code == 404
            data = response.get_json()
            assert data['error'] == 'Task not found or not completed'


class TestTaskAPIIntegration:
    """Integration tests for task API with real TaskService."""

    @pytest.fixture
    def real_task_service(self, session: Session):
        """Create real TaskService instance for integration testing."""
        from unittest.mock import MagicMock
        service = TaskService(
            shutdown_coordinator=StubShutdownCoordinator(),
            connection_manager=MagicMock(),
            max_workers=1,
            task_timeout=10
        )
        yield service
        service.shutdown()

    def test_full_task_lifecycle_via_api(self, client, app, real_task_service):
        """Test complete task lifecycle through API endpoints."""
        # Override the container to use our test task service
        with app.app_context():
            app.container.task_service.override(real_task_service)

            # Start a task (simulated by directly calling service)
            task = DemoTask()
            response = real_task_service.start_task(
                task,
                message="API integration test",
                steps=2,
                delay=0.01
            )
            task_id = response.task_id

            # Test status endpoint
            status_response = client.get(f'/api/tasks/{task_id}/status')
            assert status_response.status_code == 200
            status_data = status_response.get_json()
            assert status_data['task_id'] == task_id

            # Wait for task completion
            time.sleep(0.2)

            # Check completed status
            status_response = client.get(f'/api/tasks/{task_id}/status')
            assert status_response.status_code == 200
            status_data = status_response.get_json()
            assert status_data['status'] == TaskStatus.COMPLETED.value

            # Test removal
            remove_response = client.delete(f'/api/tasks/{task_id}')
            assert remove_response.status_code == 200

            # Verify task is gone
            status_response = client.get(f'/api/tasks/{task_id}/status')
            assert status_response.status_code == 404

    def test_task_cancellation_via_api(self, client, app, real_task_service):
        """Test task cancellation through API."""
        with app.app_context():
            app.container.task_service.override(real_task_service)

            # Start a long-running task
            from tests.test_tasks.test_task import LongRunningTask
            task = LongRunningTask()
            response = real_task_service.start_task(
                task,
                total_time=2.0,
                check_interval=0.05
            )
            task_id = response.task_id

            # Wait a bit for task to start
            time.sleep(0.1)

            # Cancel via API
            cancel_response = client.post(f'/api/tasks/{task_id}/cancel')
            assert cancel_response.status_code == 200

            # Wait for cancellation to take effect
            time.sleep(0.2)

            # Check status
            status_response = client.get(f'/api/tasks/{task_id}/status')
            assert status_response.status_code == 200
            status_data = status_response.get_json()
            assert status_data['status'] == TaskStatus.CANCELLED.value
