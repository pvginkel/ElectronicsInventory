"""Tests for health API endpoints."""

import pytest
from unittest.mock import Mock, patch
from flask import Flask, Blueprint, Response
from app.utils.graceful_shutdown import GracefulShutdownManager


def create_health_blueprint():
    """Create a simplified health blueprint for testing."""
    health_bp = Blueprint('health', __name__, url_prefix='/health')
    
    @health_bp.route('/healthz', methods=['GET'])
    def healthz():
        return Response("alive", status=200, mimetype='text/plain')
    
    @health_bp.route('/readyz', methods=['GET'])
    def readyz():
        shutdown_manager = GracefulShutdownManager()
        
        if shutdown_manager.is_draining():
            return Response("draining", status=503, mimetype='text/plain')
        
        return Response("ok", status=200, mimetype='text/plain')
    
    @health_bp.route('/drain', methods=['POST'])
    def drain():
        shutdown_manager = GracefulShutdownManager()
        shutdown_manager.set_draining(True)
        return Response("draining initiated", status=200, mimetype='text/plain')
    
    return health_bp


@pytest.fixture
def health_app():
    """Create a Flask app with just the health blueprint for testing."""
    app = Flask(__name__)
    health_bp = create_health_blueprint()
    app.register_blueprint(health_bp)
    return app


@pytest.fixture  
def health_client(health_app):
    """Create a test client for health endpoints."""
    return health_app.test_client()


class TestHealthEndpoints:
    """Test health API endpoints."""

    def test_healthz_always_returns_200(self, health_client):
        """Test liveness probe always returns 200."""
        response = health_client.get('/health/healthz')
        
        assert response.status_code == 200
        assert response.data == b'alive'
        assert response.mimetype == 'text/plain'

    def test_readyz_returns_200_when_healthy(self, health_client):
        """Test readiness probe returns 200 when service is healthy."""
        # Reset shutdown manager state
        manager = GracefulShutdownManager()
        manager.set_draining(False)
        
        response = health_client.get('/health/readyz')
        
        assert response.status_code == 200
        assert response.data == b'ok'
        assert response.mimetype == 'text/plain'
        
    def test_readyz_returns_503_when_draining(self, health_client):
        """Test readiness probe returns 503 when draining."""
        # Set draining state
        manager = GracefulShutdownManager()
        manager.set_draining(True)
        
        response = health_client.get('/health/readyz')
        
        assert response.status_code == 503
        assert response.data == b'draining'
        assert response.mimetype == 'text/plain'
        
        # Clean up
        manager.set_draining(False)
        
    def test_drain_sets_draining_state(self, health_client):
        """Test manual drain endpoint sets draining state."""
        # Reset state first
        manager = GracefulShutdownManager()
        manager.set_draining(False)
        
        response = health_client.post('/health/drain')
        
        assert response.status_code == 200
        assert response.data == b'draining initiated'
        assert response.mimetype == 'text/plain'
        
        # Verify draining state was set
        assert manager.is_draining()
        
        # Clean up
        manager.set_draining(False)
        
    def test_drain_only_accepts_post(self, health_client):
        """Test drain endpoint only accepts POST requests."""
        # Test GET returns 405
        response = health_client.get('/health/drain')
        assert response.status_code == 405
        
        # Test PUT returns 405
        response = health_client.put('/health/drain')
        assert response.status_code == 405
        
        # Test DELETE returns 405
        response = health_client.delete('/health/drain')
        assert response.status_code == 405


