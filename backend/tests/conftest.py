import pytest
import requests
import os

@pytest.fixture
def api_client():
    """Shared requests session for API calls"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def base_url():
    """Base URL for API endpoints"""
    url = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if not url:
        pytest.fail("EXPO_PUBLIC_BACKEND_URL environment variable not set")
    return url.rstrip('/')
