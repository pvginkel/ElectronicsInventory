"""Tests for OpenAIRunner attachment handling."""

import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from pydantic import BaseModel

from app.utils.ai.ai_runner import AIRequest
from app.utils.ai.openai.openai_runner import OpenAIRunner


class SimpleResponse(BaseModel):
    """Simple response model for testing."""
    message: str


class TestOpenAIRunnerAttachments:
    """Test OpenAIRunner file attachment handling."""

    @pytest.fixture
    def mock_openai_client(self):
        """Create a mock OpenAI client."""
        client = Mock()
        client.files = Mock()
        client.responses = Mock()
        return client

    @pytest.fixture
    def runner(self, mock_openai_client):
        """Create OpenAIRunner with mocked client."""
        runner = OpenAIRunner(api_key="test-key")
        runner.client = mock_openai_client
        return runner

    @pytest.fixture
    def temp_pdf_file(self):
        """Create a temporary PDF file for testing."""
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False) as f:
            f.write(b"%PDF-1.4\n%Test PDF content")
            temp_path = f.name

        yield temp_path

        # Cleanup - file should already be deleted by runner, but ensure it's gone
        try:
            Path(temp_path).unlink(missing_ok=True)
        except Exception:
            pass

    def test_run_with_single_attachment(self, runner, mock_openai_client, temp_pdf_file):
        """Test run with a single PDF attachment uploads, includes in message, and deletes."""
        # Mock file upload
        mock_file = Mock()
        mock_file.id = "file-abc123"
        mock_openai_client.files.create.return_value = mock_file

        # Mock successful API response
        mock_response = Mock()
        mock_response.status = "completed"
        mock_response.output = []
        mock_response.output_text = "Test response"
        mock_response.output_parsed = SimpleResponse(message="Test")
        mock_response.usage = Mock()
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 50
        mock_response.usage.input_tokens_details = Mock(cached_tokens=0)
        mock_response.usage.output_tokens_details = Mock(reasoning_tokens=0)
        mock_response.incomplete_details = None

        mock_openai_client.responses.parse.return_value = mock_response

        # Create request with attachment
        request = AIRequest(
            system_prompt="Test system prompt",
            user_prompt="Test user prompt",
            model="gpt-4o",
            verbosity="normal",
            response_model=SimpleResponse,
            attachments=[temp_pdf_file]
        )

        # Execute
        result = runner.run(request, function_tools=[])

        # Verify file was uploaded with correct purpose
        mock_openai_client.files.create.assert_called_once()
        call_args = mock_openai_client.files.create.call_args
        assert call_args.kwargs['purpose'] == "user_data"

        # Verify file was included in API call
        mock_openai_client.responses.parse.assert_called_once()
        api_call_args = mock_openai_client.responses.parse.call_args
        input_content = api_call_args.kwargs['input']

        # Check user message contains file reference
        user_message = input_content[1]
        assert user_message['role'] == 'user'
        assert any(
            item.get('type') == 'input_file' and item.get('file_id') == 'file-abc123'
            for item in user_message['content']
        )

        # Verify file was deleted from OpenAI
        mock_openai_client.files.delete.assert_called_once_with("file-abc123")

        # Verify temp file was deleted from filesystem
        assert not Path(temp_pdf_file).exists()

        # Verify response
        assert result.response.message == "Test"

    def test_run_with_multiple_attachments(self, runner, mock_openai_client):
        """Test run with multiple attachments uploads all and deletes all."""
        # Create multiple temp files
        temp_files = []
        for i in range(3):
            with tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False) as f:
                f.write(f"%PDF-1.4\n%Test PDF {i}".encode())
                temp_files.append(f.name)

        try:
            # Mock file uploads
            mock_files = [Mock(id=f"file-{i}") for i in range(3)]
            mock_openai_client.files.create.side_effect = mock_files

            # Mock successful API response
            mock_response = Mock()
            mock_response.status = "completed"
            mock_response.output = []
            mock_response.output_text = "Test response"
            mock_response.output_parsed = SimpleResponse(message="Test")
            mock_response.usage = Mock()
            mock_response.usage.input_tokens = 100
            mock_response.usage.output_tokens = 50
            mock_response.usage.input_tokens_details = Mock(cached_tokens=0)
            mock_response.usage.output_tokens_details = Mock(reasoning_tokens=0)
            mock_response.incomplete_details = None

            mock_openai_client.responses.parse.return_value = mock_response

            # Create request with multiple attachments
            request = AIRequest(
                system_prompt="Test system prompt",
                user_prompt="Test user prompt",
                model="gpt-4o",
                verbosity="normal",
                response_model=SimpleResponse,
                attachments=temp_files
            )

            # Execute
            runner.run(request, function_tools=[])

            # Verify all files were uploaded
            assert mock_openai_client.files.create.call_count == 3

            # Verify all files were included in API call
            api_call_args = mock_openai_client.responses.parse.call_args
            input_content = api_call_args.kwargs['input']
            user_message = input_content[1]

            file_refs = [
                item for item in user_message['content']
                if item.get('type') == 'input_file'
            ]
            assert len(file_refs) == 3
            assert {ref['file_id'] for ref in file_refs} == {"file-0", "file-1", "file-2"}

            # Verify all files were deleted from OpenAI
            assert mock_openai_client.files.delete.call_count == 3

            # Verify all temp files were deleted from filesystem
            for temp_file in temp_files:
                assert not Path(temp_file).exists()

        finally:
            # Cleanup any remaining files
            for temp_file in temp_files:
                try:
                    Path(temp_file).unlink(missing_ok=True)
                except Exception:
                    pass

    def test_run_file_deletion_failure_swallowed(self, runner, mock_openai_client, temp_pdf_file):
        """Test that OpenAI file deletion failures are logged but don't raise."""
        # Mock file upload
        mock_file = Mock()
        mock_file.id = "file-abc123"
        mock_openai_client.files.create.return_value = mock_file

        # Mock successful API response
        mock_response = Mock()
        mock_response.status = "completed"
        mock_response.output = []
        mock_response.output_text = "Test response"
        mock_response.output_parsed = SimpleResponse(message="Test")
        mock_response.usage = Mock()
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 50
        mock_response.usage.input_tokens_details = Mock(cached_tokens=0)
        mock_response.usage.output_tokens_details = Mock(reasoning_tokens=0)
        mock_response.incomplete_details = None

        mock_openai_client.responses.parse.return_value = mock_response

        # Mock file deletion failure
        mock_openai_client.files.delete.side_effect = Exception("File already deleted")

        # Create request with attachment
        request = AIRequest(
            system_prompt="Test system prompt",
            user_prompt="Test user prompt",
            model="gpt-4o",
            verbosity="normal",
            response_model=SimpleResponse,
            attachments=[temp_pdf_file]
        )

        # Execute - should not raise despite deletion failure
        result = runner.run(request, function_tools=[])

        # Verify response succeeded
        assert result.response.message == "Test"

        # Verify deletion was attempted
        mock_openai_client.files.delete.assert_called_once_with("file-abc123")

    def test_run_upload_failure_cleans_partial(self, runner, mock_openai_client):
        """Test that partial uploads are cleaned up on failure."""
        # Create multiple temp files
        temp_files = []
        for i in range(3):
            with tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False) as f:
                f.write(f"%PDF-1.4\n%Test PDF {i}".encode())
                temp_files.append(f.name)

        try:
            # Mock first two uploads succeed, third fails
            mock_file1 = Mock(id="file-1")
            mock_file2 = Mock(id="file-2")
            mock_openai_client.files.create.side_effect = [
                mock_file1,
                mock_file2,
                Exception("Upload failed")
            ]

            # Create request with multiple attachments
            request = AIRequest(
                system_prompt="Test system prompt",
                user_prompt="Test user prompt",
                model="gpt-4o",
                verbosity="normal",
                response_model=SimpleResponse,
                attachments=temp_files
            )

            # Execute - should raise from upload failure
            with pytest.raises(Exception, match="Upload failed"):  # noqa: B017
                runner.run(request, function_tools=[])

            # Verify partial uploads were cleaned up
            assert mock_openai_client.files.delete.call_count == 2
            delete_calls = {call[0][0] for call in mock_openai_client.files.delete.call_args_list}
            assert "file-1" in delete_calls
            assert "file-2" in delete_calls

            # Verify all temp files were deleted
            for temp_file in temp_files:
                assert not Path(temp_file).exists()

        finally:
            # Cleanup any remaining files
            for temp_file in temp_files:
                try:
                    Path(temp_file).unlink(missing_ok=True)
                except Exception:
                    pass

    def test_run_no_attachments_backward_compatible(self, runner, mock_openai_client):
        """Test that run works without attachments (backward compatibility)."""
        # Mock successful API response
        mock_response = Mock()
        mock_response.status = "completed"
        mock_response.output = []
        mock_response.output_text = "Test response"
        mock_response.output_parsed = SimpleResponse(message="Test")
        mock_response.usage = Mock()
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 50
        mock_response.usage.input_tokens_details = Mock(cached_tokens=0)
        mock_response.usage.output_tokens_details = Mock(reasoning_tokens=0)
        mock_response.incomplete_details = None

        mock_openai_client.responses.parse.return_value = mock_response

        # Create request without attachments
        request = AIRequest(
            system_prompt="Test system prompt",
            user_prompt="Test user prompt",
            model="gpt-4o",
            verbosity="normal",
            response_model=SimpleResponse,
            attachments=None
        )

        # Execute
        result = runner.run(request, function_tools=[])

        # Verify no file operations
        mock_openai_client.files.create.assert_not_called()
        mock_openai_client.files.delete.assert_not_called()

        # Verify API call has no file references
        api_call_args = mock_openai_client.responses.parse.call_args
        input_content = api_call_args.kwargs['input']
        user_message = input_content[1]

        file_refs = [
            item for item in user_message['content']
            if item.get('type') == 'input_file'
        ]
        assert len(file_refs) == 0

        # Verify response
        assert result.response.message == "Test"

    def test_run_temp_file_deletion_failure_logged(self, runner, mock_openai_client, temp_pdf_file):
        """Test that temp file deletion failures are logged but don't raise."""
        # Mock file upload
        mock_file = Mock()
        mock_file.id = "file-abc123"
        mock_openai_client.files.create.return_value = mock_file

        # Mock successful API response
        mock_response = Mock()
        mock_response.status = "completed"
        mock_response.output = []
        mock_response.output_text = "Test response"
        mock_response.output_parsed = SimpleResponse(message="Test")
        mock_response.usage = Mock()
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 50
        mock_response.usage.input_tokens_details = Mock(cached_tokens=0)
        mock_response.usage.output_tokens_details = Mock(reasoning_tokens=0)
        mock_response.incomplete_details = None

        mock_openai_client.responses.parse.return_value = mock_response

        # Mock temp file deletion to fail (despite missing_ok=True, could be permission error)
        with patch('pathlib.Path.unlink', side_effect=PermissionError("Permission denied")):
            # Create request with attachment
            request = AIRequest(
                system_prompt="Test system prompt",
                user_prompt="Test user prompt",
                model="gpt-4o",
                verbosity="normal",
                response_model=SimpleResponse,
                attachments=[temp_pdf_file]
            )

            # Execute - should not raise despite temp file deletion failure
            result = runner.run(request, function_tools=[])

            # Verify response succeeded
            assert result.response.message == "Test"

            # Verify OpenAI file was still deleted
            mock_openai_client.files.delete.assert_called_once_with("file-abc123")
