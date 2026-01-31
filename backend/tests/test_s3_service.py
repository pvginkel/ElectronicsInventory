"""Unit tests for S3Service."""

import io
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError, NoCredentialsError
from flask import Flask

from app.config import Settings
from app.exceptions import InvalidOperationException
from app.services.s3_service import S3Service


@pytest.fixture
def mock_s3_client():
    """Create a mock S3 client."""
    return MagicMock()


@pytest.fixture
def s3_service(app: Flask, mock_s3_client, test_settings):
    """Create S3Service with mocked client."""
    with app.app_context():
        service = S3Service(test_settings)
        service._s3_client = mock_s3_client
        return service


class TestS3Service:
    """Test S3Service functionality."""

    def test_init_creates_client(self, app: Flask, test_settings: Settings):
        """Test that S3Service initializes with boto3 client."""
        with app.app_context():
            service = S3Service(test_settings)
            assert service.s3_client is not None

    # Note: test_generate_s3_key removed - generate_s3_key was replaced by generate_cas_key

    def test_upload_file_success(self, s3_service, mock_s3_client):
        """Test successful file upload."""
        file_data = io.BytesIO(b"test file content")
        s3_key = "test/key.txt"
        content_type = "text/plain"

        mock_s3_client.upload_fileobj.return_value = None

        result = s3_service.upload_file(file_data, s3_key, content_type)

        assert result is True
        mock_s3_client.upload_fileobj.assert_called_once()
        args, kwargs = mock_s3_client.upload_fileobj.call_args
        assert args[0] == file_data
        assert args[1] == s3_service.settings.s3_bucket_name
        assert args[2] == s3_key
        assert kwargs["ExtraArgs"]["ContentType"] == content_type

    def test_upload_file_client_error(self, s3_service, mock_s3_client):
        """Test file upload with client error."""
        file_data = io.BytesIO(b"test content")
        mock_s3_client.upload_fileobj.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access denied"}},
            "PutObject"
        )

        with pytest.raises(InvalidOperationException) as exc_info:
            s3_service.upload_file(file_data, "test/key", "text/plain")

        assert "upload file to S3" in str(exc_info.value)
        assert "Access denied" in str(exc_info.value)

    def test_upload_file_no_credentials(self, s3_service, mock_s3_client):
        """Test file upload with missing credentials."""
        file_data = io.BytesIO(b"test content")
        mock_s3_client.upload_fileobj.side_effect = NoCredentialsError()

        # NoCredentialsError is not caught by the service, so it bubbles up
        with pytest.raises(NoCredentialsError):
            s3_service.upload_file(file_data, "test/key")

    def test_download_file_success(self, s3_service, mock_s3_client):
        """Test successful file download."""
        test_content = b"downloaded file content"

        def mock_download(bucket, key, fileobj):
            fileobj.write(test_content)

        mock_s3_client.download_fileobj.side_effect = mock_download

        result = s3_service.download_file("test/key.txt")

        assert isinstance(result, io.BytesIO)
        assert result.getvalue() == test_content
        mock_s3_client.download_fileobj.assert_called_once()

    def test_download_file_not_found(self, s3_service, mock_s3_client):
        """Test download of non-existent file."""
        mock_s3_client.download_fileobj.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "The specified key does not exist"}},
            "GetObject"
        )

        with pytest.raises(InvalidOperationException) as exc_info:
            s3_service.download_file("nonexistent/key")

        assert "download file from S3" in str(exc_info.value)

    def test_delete_file_success(self, s3_service, mock_s3_client):
        """Test successful file deletion."""
        mock_s3_client.delete_object.return_value = {"DeleteMarker": True}

        result = s3_service.delete_file("test/key.txt")

        assert result is True
        mock_s3_client.delete_object.assert_called_once()
        args, kwargs = mock_s3_client.delete_object.call_args
        assert "electronics-inventory" in kwargs["Bucket"]
        assert kwargs["Key"] == "test/key.txt"

    def test_delete_file_not_found(self, s3_service, mock_s3_client):
        """Test deletion of non-existent file."""
        mock_s3_client.delete_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "The specified key does not exist"}},
            "DeleteObject"
        )

        with pytest.raises(InvalidOperationException) as exc_info:
            s3_service.delete_file("nonexistent/key")

        assert "delete file from S3" in str(exc_info.value)

    def test_file_exists_true(self, s3_service, mock_s3_client):
        """Test checking existence of existing file."""
        mock_s3_client.head_object.return_value = {"ContentLength": 1024}

        result = s3_service.file_exists("existing/key.txt")

        assert result is True
        mock_s3_client.head_object.assert_called_once()
        args, kwargs = mock_s3_client.head_object.call_args
        assert "electronics-inventory" in kwargs["Bucket"]
        assert kwargs["Key"] == "existing/key.txt"

    def test_file_exists_false(self, s3_service, mock_s3_client):
        """Test checking existence of non-existent file."""
        mock_s3_client.head_object.side_effect = ClientError(
            {"Error": {"Code": "404", "Message": "Not Found"}},
            "HeadObject"
        )

        result = s3_service.file_exists("nonexistent/key.txt")

        assert result is False

    def test_file_exists_other_error(self, s3_service, mock_s3_client):
        """Test file existence check with unexpected error."""
        mock_s3_client.head_object.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "Access denied"}},
            "HeadObject"
        )

        with pytest.raises(InvalidOperationException) as exc_info:
            s3_service.file_exists("test/key.txt")

        assert "check file existence in S3" in str(exc_info.value)

    def test_upload_file_no_content_type(self, s3_service, mock_s3_client):
        """Test upload without explicit content type."""
        file_data = io.BytesIO(b"test content")

        s3_service.upload_file(file_data, "test/key.bin")

        args, kwargs = mock_s3_client.upload_fileobj.call_args
        assert "ExtraArgs" not in kwargs

    def test_uses_config_values(self, app: Flask, test_settings: Settings):
        """Test that service uses Flask config values."""
        with app.app_context():
            with patch('app.services.s3_service.boto3.client') as mock_boto3:
                service = S3Service(test_settings)
                # Access the s3_client property to trigger boto3.client call
                _ = service.s3_client

                # Should have been called with config values from test app
                mock_boto3.assert_called_once()
                call_args = mock_boto3.call_args[1]  # kwargs
                assert call_args['endpoint_url'] is not None
                assert call_args['aws_access_key_id'] is not None
                assert call_args['aws_secret_access_key'] is not None
