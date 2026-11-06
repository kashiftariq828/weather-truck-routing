import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolated_cache(settings):
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    settings.TOMTOM_API_KEY = "test-key"
    cache.clear()
    yield
    cache.clear()
