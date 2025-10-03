"""Helpers for parsing common request parameter types."""

from __future__ import annotations


_TRUE_VALUES = {"true", "1", "yes", "on"}


def parse_bool_query_param(raw_value: str | None, *, default: bool = False) -> bool:
    """Interpret a truthy query parameter value with a configurable default."""
    if raw_value is None:
        return default
    return raw_value.lower() in _TRUE_VALUES


__all__ = ["parse_bool_query_param"]
