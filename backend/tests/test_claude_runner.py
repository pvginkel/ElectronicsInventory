"""Tests for Claude AI Runner."""

from unittest.mock import Mock, patch

import pytest
from anthropic import APIError
from anthropic.types import Message, TextBlock, ToolUseBlock, Usage
from pydantic import BaseModel, Field

from app.utils.ai.ai_runner import AIFunction, AIRequest, AIResponse
from app.utils.ai.claude.claude_runner import ClaudeRunner
from tests.testing_utils import StubMetricsService


class SimpleResponse(BaseModel):
    """Simple response model for testing."""

    message: str = Field(description="A simple message")
    count: int = Field(description="A count value")


class FunctionRequest(BaseModel):
    """Function request model for testing."""

    query: str = Field(description="Search query")


class FunctionResponse(BaseModel):
    """Function response model for testing."""

    result: str = Field(description="Search result")


class MockFunction(AIFunction):
    """Mock function for testing."""

    def __init__(self, name: str = "test_function"):
        self.name = name
        self.executed = False
        self.last_request = None

    def get_name(self) -> str:
        return self.name

    def get_description(self) -> str:
        return "A test function"

    def get_model(self) -> type[BaseModel]:
        return FunctionRequest

    def execute(self, request: BaseModel, progress_handle) -> BaseModel:
        self.executed = True
        self.last_request = request
        return FunctionResponse(result="test result")


class TestClaudeRunner:
    """Test cases for ClaudeRunner."""

    @pytest.fixture
    def mock_metrics_service(self):
        """Create mock metrics service."""
        return StubMetricsService()

    @pytest.fixture
    def claude_runner(self, mock_metrics_service):
        """Create Claude runner instance for testing."""
        return ClaudeRunner("test-api-key", mock_metrics_service)

    def test_init(self):
        """Test ClaudeRunner initialization."""
        runner = ClaudeRunner("test-api-key")
        assert runner.client is not None
        assert runner.metrics_service is None

        metrics = StubMetricsService()
        runner_with_metrics = ClaudeRunner("test-api-key", metrics)
        assert runner_with_metrics.metrics_service is metrics

    def test_build_messages(self, claude_runner):
        """Test message building for Claude API."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Analyze this part",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort="low",
            response_model=SimpleResponse,
        )

        messages = claude_runner._build_messages(request)

        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Analyze this part"

    def test_build_tools(self, claude_runner):
        """Test tool building for Claude API."""
        mock_function = MockFunction("url_classifier")
        tools = claude_runner._build_tools(SimpleResponse, [mock_function])

        # Should have structured_response tool + function tool
        assert len(tools) == 2

        # Check structured_response tool
        assert tools[0]["name"] == "structured_response"
        assert "input_schema" in tools[0]
        assert tools[0]["description"] == "Return the structured analysis result"

        # Check function tool
        assert tools[1]["name"] == "url_classifier"
        assert "input_schema" in tools[1]

    def test_run_simple_structured_output(self, claude_runner):
        """Test simple structured output without function calls."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Say hello",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        # Mock the Claude API response
        mock_message = Mock(spec=Message)
        mock_message.stop_reason = "end_turn"
        mock_message.content = [
            TextBlock(text="Hello", type="text"),
            ToolUseBlock(
                id="tool_1",
                name="structured_response",
                input={"message": "Hello", "count": 42},
                type="tool_use",
            ),
        ]
        mock_message.usage = Usage(input_tokens=100, output_tokens=50)

        with patch.object(
            claude_runner.client.messages, "create", return_value=mock_message
        ):
            response = claude_runner.run(request, [], streaming=False)

        assert isinstance(response, AIResponse)
        assert isinstance(response.response, SimpleResponse)
        assert response.response.message == "Hello"
        assert response.response.count == 42
        assert response.input_tokens == 100
        assert response.output_tokens == 50
        assert response.cost is not None

    def test_run_with_function_call(self, claude_runner):
        """Test structured output with function call."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Search for duplicates",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        mock_function = MockFunction("duplicate_search")

        # First call: Claude calls the function
        mock_message_1 = Mock(spec=Message)
        mock_message_1.stop_reason = "tool_use"
        mock_message_1.content = [
            ToolUseBlock(
                id="tool_1",
                name="duplicate_search",
                input={"query": "test query"},
                type="tool_use",
            ),
        ]
        mock_message_1.usage = Usage(input_tokens=100, output_tokens=30)

        # Second call: Claude returns structured response
        mock_message_2 = Mock(spec=Message)
        mock_message_2.stop_reason = "end_turn"
        mock_message_2.content = [
            TextBlock(text="Found results", type="text"),
            ToolUseBlock(
                id="tool_2",
                name="structured_response",
                input={"message": "Found results", "count": 1},
                type="tool_use",
            ),
        ]
        mock_message_2.usage = Usage(input_tokens=50, output_tokens=40)

        with patch.object(
            claude_runner.client.messages,
            "create",
            side_effect=[mock_message_1, mock_message_2],
        ):
            response = claude_runner.run(request, [mock_function], streaming=False)

        assert mock_function.executed
        assert mock_function.last_request.query == "test query"
        assert isinstance(response.response, SimpleResponse)
        assert response.response.message == "Found results"
        assert response.response.count == 1
        assert response.input_tokens == 150  # 100 + 50
        assert response.output_tokens == 70  # 30 + 40

    def test_run_missing_structured_response(self, claude_runner):
        """Test error when structured response is not returned."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Say hello",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        # Mock message without structured_response tool call
        mock_message = Mock(spec=Message)
        mock_message.stop_reason = "end_turn"
        mock_message.content = [TextBlock(text="Hello", type="text")]
        mock_message.usage = Usage(input_tokens=100, output_tokens=50)

        with patch.object(
            claude_runner.client.messages, "create", return_value=mock_message
        ):
            with pytest.raises(Exception, match="Empty response from Claude"):
                claude_runner.run(request, [], streaming=False)

    def test_run_max_iterations(self, claude_runner):
        """Test max iterations guard."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Keep calling functions",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        mock_function = MockFunction("test_function")

        # Create mock message that always calls a tool
        def create_tool_call_message(*args, **kwargs):
            mock_message = Mock(spec=Message)
            mock_message.stop_reason = "tool_use"
            mock_message.content = [
                ToolUseBlock(
                    id="tool_1",
                    name="test_function",
                    input={"query": "test"},
                    type="tool_use",
                ),
            ]
            mock_message.usage = Usage(input_tokens=10, output_tokens=10)
            return mock_message

        with patch.object(
            claude_runner.client.messages, "create", side_effect=create_tool_call_message
        ):
            with pytest.raises(Exception, match="Empty response from Claude"):
                claude_runner.run(request, [mock_function], streaming=False)

    def test_run_api_error_with_retry(self, claude_runner):
        """Test API error handling with retry logic."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Say hello",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        # Mock successful response after 2 failures
        mock_message = Mock(spec=Message)
        mock_message.stop_reason = "end_turn"
        mock_message.content = [
            ToolUseBlock(
                id="tool_1",
                name="structured_response",
                input={"message": "Success", "count": 1},
                type="tool_use",
            ),
        ]
        mock_message.usage = Usage(input_tokens=100, output_tokens=50)

        api_error = APIError(
            message="Rate limit exceeded",
            request=Mock(),
            body=None,
        )

        with patch.object(
            claude_runner.client.messages,
            "create",
            side_effect=[api_error, api_error, mock_message],
        ):
            response = claude_runner.run(request, [], streaming=False)

        assert response.response.message == "Success"

    def test_run_api_error_exhausted_retries(self, claude_runner):
        """Test API error when all retries are exhausted."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Say hello",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        api_error = APIError(
            message="Authentication failed",
            request=Mock(),
            body=None,
        )

        with patch.object(
            claude_runner.client.messages, "create", side_effect=api_error
        ):
            with pytest.raises(APIError):
                claude_runner.run(request, [], streaming=False)

    def test_run_function_execution_error(self, claude_runner):
        """Test handling of function execution errors."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Call a function",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        # Create a function that raises an exception
        error_function = Mock(spec=AIFunction)
        error_function.get_name.return_value = "error_function"
        error_function.get_model.return_value = FunctionRequest
        error_function.execute.side_effect = ValueError("Function error")

        # First call: Claude calls the function
        mock_message_1 = Mock(spec=Message)
        mock_message_1.stop_reason = "tool_use"
        mock_message_1.content = [
            ToolUseBlock(
                id="tool_1",
                name="error_function",
                input={"query": "test"},
                type="tool_use",
            ),
        ]
        mock_message_1.usage = Usage(input_tokens=100, output_tokens=30)

        # Second call: Claude returns structured response
        mock_message_2 = Mock(spec=Message)
        mock_message_2.stop_reason = "end_turn"
        mock_message_2.content = [
            ToolUseBlock(
                id="tool_2",
                name="structured_response",
                input={"message": "Handled error", "count": 0},
                type="tool_use",
            ),
        ]
        mock_message_2.usage = Usage(input_tokens=50, output_tokens=40)

        with patch.object(
            claude_runner.client.messages,
            "create",
            side_effect=[mock_message_1, mock_message_2],
        ):
            response = claude_runner.run(request, [error_function], streaming=False)

        # Should continue and return structured response
        assert response.response.message == "Handled error"

    def test_run_cached_tokens(self, claude_runner):
        """Test token counting with cache hits."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Say hello",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort=None,
            response_model=SimpleResponse,
        )

        # Mock message with cache read tokens
        mock_message = Mock(spec=Message)
        mock_message.stop_reason = "end_turn"
        mock_message.content = [
            ToolUseBlock(
                id="tool_1",
                name="structured_response",
                input={"message": "Hello", "count": 1},
                type="tool_use",
            ),
        ]

        # Create usage with cache tokens
        mock_usage = Mock(spec=Usage)
        mock_usage.input_tokens = 100
        mock_usage.output_tokens = 50
        mock_usage.cache_read_input_tokens = 20
        mock_message.usage = mock_usage

        with patch.object(
            claude_runner.client.messages, "create", return_value=mock_message
        ):
            response = claude_runner.run(request, [], streaming=False)

        assert response.input_tokens == 100
        assert response.cached_input_tokens == 20
        assert response.cost is not None

    def test_cost_calculation_claude_models(self):
        """Test cost calculation for Claude models."""
        from app.utils.ai.cost_calculation import calculate_cost

        # Test Claude Sonnet 3.5
        cost = calculate_cost(
            "claude-3-5-sonnet-20241022",
            input_tokens=1000,
            cached_input_tokens=200,
            output_tokens=500,
            reasoning_tokens=0,
            web_search_count=0,
        )
        # (200 * 0.30 + 800 * 3.00 + 500 * 15.00) / 1_000_000
        # = (60 + 2400 + 7500) / 1_000_000 = 9960 / 1_000_000 = 0.00996
        assert cost == pytest.approx(0.00996, rel=1e-5)

        # Test Claude Haiku 3.5
        cost = calculate_cost(
            "claude-3-5-haiku-20241022",
            input_tokens=1000,
            cached_input_tokens=200,
            output_tokens=500,
            reasoning_tokens=0,
            web_search_count=0,
        )
        # (200 * 0.08 + 800 * 0.80 + 500 * 4.00) / 1_000_000
        # = (16 + 640 + 2000) / 1_000_000 = 2656 / 1_000_000 = 0.002656
        assert cost == pytest.approx(0.002656, rel=1e-5)

        # Test unknown Claude model
        cost = calculate_cost(
            "claude-unknown-model",
            input_tokens=1000,
            cached_input_tokens=200,
            output_tokens=500,
            reasoning_tokens=0,
            web_search_count=0,
        )
        assert cost is None

    def test_extract_output_text(self, claude_runner):
        """Test output text extraction from message."""
        mock_message = Mock(spec=Message)
        mock_message.content = [
            TextBlock(text="This is text", type="text"),
            ToolUseBlock(id="tool_1", name="test_tool", input={}, type="tool_use"),
            TextBlock(text="More text", type="text"),
        ]

        output_text = claude_runner._extract_output_text(mock_message)

        assert "This is text" in output_text
        assert "[Tool: test_tool]" in output_text
        assert "More text" in output_text

    def test_reasoning_effort_warning(self, claude_runner, caplog):
        """Test that reasoning_effort generates a warning for Claude."""
        request = AIRequest(
            system_prompt="You are an assistant",
            user_prompt="Say hello",
            model="claude-3-5-sonnet-20241022",
            verbosity="medium",
            reasoning_effort="high",  # Claude doesn't support this
            response_model=SimpleResponse,
        )

        mock_message = Mock(spec=Message)
        mock_message.stop_reason = "end_turn"
        mock_message.content = [
            ToolUseBlock(
                id="tool_1",
                name="structured_response",
                input={"message": "Hello", "count": 1},
                type="tool_use",
            ),
        ]
        mock_message.usage = Usage(input_tokens=100, output_tokens=50)

        with patch.object(
            claude_runner.client.messages, "create", return_value=mock_message
        ):
            claude_runner.run(request, [], streaming=False)

        # Check that warning was logged
        assert any("reasoning_effort" in record.message for record in caplog.records)
