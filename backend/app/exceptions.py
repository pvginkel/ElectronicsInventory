"""Domain-specific exceptions with user-ready messages for the inventory system."""


class InventoryException(Exception):
    """Base exception class for inventory-related errors.

    All inventory exceptions include user-ready messages that can be
    displayed directly in the UI without client-side message construction.
    """

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class RecordNotFoundException(InventoryException):
    """Exception raised when a requested record is not found."""

    def __init__(self, resource_type: str, identifier: str | int) -> None:
        message = f"{resource_type} {identifier} was not found"
        super().__init__(message)


class ResourceConflictException(InventoryException):
    """Exception raised when attempting to create a resource that already exists."""

    def __init__(self, resource_type: str, identifier: str | int) -> None:
        message = f"A {resource_type.lower()} with {identifier} already exists"
        super().__init__(message)


class InsufficientQuantityException(InventoryException):
    """Exception raised when there's not enough quantity available for an operation."""

    def __init__(self, requested: int, available: int, location: str = "") -> None:
        location_text = f" at {location}" if location else ""
        message = f"Not enough parts available{location_text} (requested {requested}, have {available})"
        super().__init__(message)


class CapacityExceededException(InventoryException):
    """Exception raised when a box or location capacity would be exceeded."""

    def __init__(self, resource_type: str, identifier: str | int) -> None:
        message = f"{resource_type} {identifier} is full and cannot hold more items"
        super().__init__(message)


class InvalidOperationException(InventoryException):
    """Exception raised when an operation cannot be performed due to business rules."""

    def __init__(self, operation: str, reason: str) -> None:
        message = f"Cannot {operation} because {reason}"
        super().__init__(message)
