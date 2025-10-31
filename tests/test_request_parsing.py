"""Tests for request parsing utility functions."""

import pytest

from app.models.shopping_list import ShoppingListStatus
from app.utils.request_parsing import (
    parse_bool_query_param,
    parse_enum_list_query_param,
)


def test_parse_bool_query_param_defaults_false():
    assert parse_bool_query_param(None) is False
    assert parse_bool_query_param("true") is True
    assert parse_bool_query_param("0", default=True) is False


def test_parse_enum_list_query_param_handles_repeated_and_comma():
    values = ["concept", "ready,done", "concept"]
    result = parse_enum_list_query_param(values, ShoppingListStatus)
    assert result == [
        ShoppingListStatus.CONCEPT,
        ShoppingListStatus.READY,
        ShoppingListStatus.DONE,
    ]


def test_parse_enum_list_query_param_rejects_invalid_values():
    with pytest.raises(ValueError):
        parse_enum_list_query_param(["invalid"], ShoppingListStatus)
