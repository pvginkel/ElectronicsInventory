"""Custom Flask application class with typed container attribute."""

from typing import cast

from flask import Flask, current_app

from app.services.container import ServiceContainer
from app.services.diagnostics_service import DiagnosticsService


class App(Flask):
    container: ServiceContainer
    diagnostics_service: DiagnosticsService


def current_container() -> ServiceContainer:
    """Return the service container of the app handling the current request.

    ``current_app`` is typed as plain ``Flask``, which does not carry the
    container attribute; this narrows it to the ``App`` subclass that does.
    """
    return cast(App, current_app).container
