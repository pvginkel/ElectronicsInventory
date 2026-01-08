def calculate_cost(model: str, input_tokens: int, cached_input_tokens: int, output_tokens: int, reasoning_tokens: int, web_search_count: int) -> float | None:
    """Calculate cost for AI model usage.

    Pricing verified from:
    - OpenAI: https://openai.com/pricing (as of 2024)
    - Anthropic: https://docs.anthropic.com/en/docs/about-claude/models (as of Dec 2024)

    Note: Claude pricing includes reasoning tokens in output tokens (no separate reasoning cost).
    Note: OpenAI web search costs $10 per 1,000 calls ($0.01 per search).
    """
    input_tokens_pm: float
    cached_input_pm: float
    output_pm: float

    match model:
        # OpenAI models
        case "gpt-5" | "gpt-5.1" | "gpt-5-codex" | "gpt-5.1-codex":
            input_tokens_pm = 1.25
            cached_input_pm = 0.125
            output_pm = 10
        case "gpt-5-mini" | "gpt-5.1-mini" | "gpt-5.1-codex-mini":
            input_tokens_pm = 0.25
            cached_input_pm = 0.025
            output_pm = 2
        case "gpt-5-nano":
            input_tokens_pm = 0.05
            cached_input_pm = 0.005
            output_pm = 0.4
        case "gpt-4.1":
            input_tokens_pm = 3
            cached_input_pm = 0.75
            output_pm = 12
        case "gpt-4.1-mini":
            input_tokens_pm = 0.8
            cached_input_pm = 0.2
            output_pm = 3.2

        # Claude models (Anthropic pricing as of Dec 2024)
        case "claude-3-5-sonnet-20241022" | "claude-3-5-sonnet-latest":
            # Sonnet 3.5: $3/$15 per million tokens (input/output)
            # Cache write: $3.75, cache read: $0.30
            input_tokens_pm = 3.00
            cached_input_pm = 0.30
            output_pm = 15.00
        case "claude-3-5-haiku-20241022" | "claude-3-5-haiku-latest":
            # Haiku 3.5: $0.80/$4 per million tokens (input/output)
            # Cache write: $1.00, cache read: $0.08
            input_tokens_pm = 0.80
            cached_input_pm = 0.08
            output_pm = 4.00
        case "claude-sonnet-4-5":
            # Sonnet 4.5: $3/$15 per million tokens (input/output)
            input_tokens_pm = 3.00
            cached_input_pm = 0.30
            output_pm = 15.00
        case "claude-opus-4":
            # Opus 4: $15/$75 per million tokens (input/output)
            # Cache write: $18.75, cache read: $1.50
            input_tokens_pm = 15.00
            cached_input_pm = 1.50
            output_pm = 75.00
        case "claude-opus-4-5":
            # Opus 4: $5/$25 per million tokens (input/output)
            # Cache write: $6.25, cache read: $0.50
            input_tokens_pm = 5.00
            cached_input_pm = 0.50
            output_pm = 25.00

        case _:
            return None

    # For Claude models, reasoning_tokens are included in output_tokens
    # (Claude doesn't separate reasoning from regular output)
    total_output = output_tokens + reasoning_tokens

    # Web search cost: $10 per 1,000 calls = $0.01 per search
    web_search_cost = web_search_count * 0.01

    return (
        cached_input_tokens * (cached_input_pm / 1_000_000) +
        (input_tokens - cached_input_tokens) * (input_tokens_pm / 1_000_000) +
        total_output * (output_pm / 1_000_000) +
        web_search_cost
    )
