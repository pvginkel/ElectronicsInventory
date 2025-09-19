"""Domain-specific exceptions with user-ready messages for the inventory system."""


class BusinessLogicException(Exception):
    """Base exception class for business logic errors.

    All business logic exceptions include user-ready messages that can be
    displayed directly in the UI without client-side message construction.
    """

    def __init__(self, message: str, error_code: str) -> None:
        self.message = message
        self.error_code = error_code
        super().__init__(message)


class RecordNotFoundException(BusinessLogicException):
    """Exception raised when a requested record is not found."""

    def __init__(self, resource_type: str, identifier: str | int) -> None:
        message = f"{resource_type} {identifier} was not found"
        super().__init__(message, error_code="RECORD_NOT_FOUND")


class ResourceConflictException(BusinessLogicException):
    """Exception raised when attempting to create a resource that already exists."""

    def __init__(self, resource_type: str, identifier: str | int) -> None:
        message = f"A {resource_type.lower()} with {identifier} already exists"
        super().__init__(message, error_code="RESOURCE_CONFLICT")


class InsufficientQuantityException(BusinessLogicException):
    """Exception raised when there's not enough quantity available for an operation."""

    def __init__(self, requested: int, available: int, location: str = "") -> None:
        location_text = f" at {location}" if location else ""
        message = f"Not enough parts available{location_text} (requested {requested}, have {available})"
        super().__init__(message, error_code="INSUFFICIENT_QUANTITY")


class CapacityExceededException(BusinessLogicException):
    """Exception raised when a box or location capacity would be exceeded."""

    def __init__(self, resource_type: str, identifier: str | int) -> None:
        message = f"{resource_type} {identifier} is full and cannot hold more items"
        super().__init__(message, error_code="CAPACITY_EXCEEDED")


class InvalidOperationException(BusinessLogicException):
    """Exception raised when an operation cannot be performed due to business rules."""

    def __init__(self, operation: str, cause: str) -> None:
        self.operation = operation
        self.cause = cause
        message = f"Cannot {operation} because {cause}"
        super().__init__(message, error_code="INVALID_OPERATION")


class DependencyException(BusinessLogicException):
    """Exception raised when a resource cannot be deleted due to dependencies."""

    def __init__(self, resource_type: str, identifier: str | int, dependency_desc: str) -> None:
        message = f"Cannot delete {resource_type} {identifier} because {dependency_desc}"
        super().__init__(message, error_code="TYPE_IN_USE")
