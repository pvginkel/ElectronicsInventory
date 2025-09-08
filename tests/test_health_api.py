"""Tests for health API endpoints."""

import pytest
from flask import Flask, Blueprint, Response
from dependency_injector import containers, providers

from app.config import Settings
from app.utils.graceful_shutdown import NoopGracefulShutdownManager


def create_health_routes(shutdown_manager, config):
    """Create health routes for testing without full API setup."""
    health_bp = Blueprint('health', __name__, url_prefix='/health')
    
    @health_bp.route('/healthz', methods=['GET'])
    def healthz():
        return Response("alive", status=200, mimetype='text/plain')
    
    @health_bp.route('/readyz', methods=['GET'])
    def readyz():
        if shutdown_manager.is_draining():
            return Response("draining", status=503, mimetype='text/plain')
        return Response("ok", status=200, mimetype='text/plain')
    
    @health_bp.route('/drain', methods=['POST'])
    def drain():
        from flask import request
        
        # Check if drain endpoint should be disabled in production without auth
        if config.FLASK_ENV == "production" and not config.DRAIN_AUTH_KEY:
            return Response("forbidden in production without auth", status=403, mimetype='text/plain')
        
        # Check authentication (only if auth key is configured)
        if config.DRAIN_AUTH_KEY:
            auth_key = request.headers.get('X-Auth-Key')
            if not auth_key or auth_key != config.DRAIN_AUTH_KEY:
                return Response("unauthorized", status=401, mimetype='text/plain')
        
        shutdown_manager.set_draining(True)
        return Response("draining initiated", status=200, mimetype='text/plain')
    
    return health_bp


@pytest.fixture
def shutdown_manager():
    """Create a shutdown manager for testing."""
    return NoopGracefulShutdownManager()


@pytest.fixture
def config():
    """Create a config for testing."""
    return Settings()


@pytest.fixture
def health_app(shutdown_manager, config):
    """Create a Flask app with health blueprint for testing."""
    app = Flask(__name__)
    
    # Store dependencies for access in tests
    app.shutdown_manager = shutdown_manager
    app.config_settings = config
    
    # Create and register health blueprint
    health_bp = create_health_routes(shutdown_manager, config)
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

    def test_readyz_returns_200_when_healthy(self, health_client, shutdown_manager):
        """Test readiness probe returns 200 when service is healthy."""
        # Reset shutdown manager state
        shutdown_manager.set_draining(False)
        
        response = health_client.get('/health/readyz')
        
        assert response.status_code == 200
        assert response.data == b'ok'
        assert response.mimetype == 'text/plain'
        
    def test_readyz_returns_503_when_draining(self, health_client, shutdown_manager):
        """Test readiness probe returns 503 when draining."""
        # Set draining state
        shutdown_manager.set_draining(True)
        
        response = health_client.get('/health/readyz')
        
        assert response.status_code == 503
        assert response.data == b'draining'
        assert response.mimetype == 'text/plain'
        
        # Clean up
        shutdown_manager.set_draining(False)
        
    def test_drain_endpoint_works_when_no_auth_key_in_nonproduction(self, health_client, shutdown_manager):
        """Test drain endpoint works when no auth key is configured in non-production."""
        response = health_client.post('/health/drain')
        
        assert response.status_code == 200
        assert response.data == b'draining initiated'
        assert response.mimetype == 'text/plain'
        assert shutdown_manager.is_draining()
        
        # Clean up
        shutdown_manager.set_draining(False)
    
    def test_drain_endpoint_forbidden_in_production_without_auth(self, shutdown_manager):
        """Test drain endpoint returns 403 in production when no auth key is configured."""
        from flask import Flask
        
        # Create app with production environment but no auth key
        app = Flask(__name__)
        config = Settings(FLASK_ENV="production")  # Production with no DRAIN_AUTH_KEY
        health_bp = create_health_routes(shutdown_manager, config)
        app.register_blueprint(health_bp)
        client = app.test_client()
        
        response = client.post('/health/drain')
        
        assert response.status_code == 403
        assert response.data == b'forbidden in production without auth'
        assert response.mimetype == 'text/plain'
    
    def test_drain_endpoint_allows_no_auth_in_nonproduction(self, health_client, shutdown_manager):
        """Test drain endpoint allows no auth in non-production environments."""
        # Test without auth header (config has no auth key by default, non-production)
        response = health_client.post('/health/drain')
        assert response.status_code == 200
        assert response.data == b'draining initiated'
        assert shutdown_manager.is_draining()
        
        # Clean up
        shutdown_manager.set_draining(False)
    
    def test_drain_endpoint_with_auth_key(self, shutdown_manager):
        """Test drain endpoint with authentication configured."""
        from flask import Flask
        
        # Create app with auth key configured
        app = Flask(__name__)
        config = Settings(DRAIN_AUTH_KEY="test-key")
        health_bp = create_health_routes(shutdown_manager, config)
        app.register_blueprint(health_bp)
        client = app.test_client()
        
        # Test without auth header
        response = client.post('/health/drain')
        assert response.status_code == 401
        assert response.data == b'unauthorized'
        
        # Test with wrong auth header
        response = client.post('/health/drain', headers={'X-Auth-Key': 'wrong-key'})
        assert response.status_code == 401
        assert response.data == b'unauthorized'
        
        # Test with correct auth header
        response = client.post('/health/drain', headers={'X-Auth-Key': 'test-key'})
        assert response.status_code == 200
        assert response.data == b'draining initiated'
        assert shutdown_manager.is_draining()
        
        # Clean up
        shutdown_manager.set_draining(False)
        
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


