"""Test health check endpoint."""



def test_health_check(client) -> None:
    """Test health check endpoint returns healthy status."""
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json == {"status": "healthy"}
