def calculate_cost(model: str, input_tokens: int, cached_input_tokens: int, output_tokens: int, reasoning_tokens: int, web_search_count: int) -> float | None:
    """Calculate cost for AI model usage.

    Pricing verified from:
    - OpenAI: https://openai.com/pricing (as of 2024)

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

        case _:
            return None

    total_output = output_tokens + reasoning_tokens

    # Web search cost: $10 per 1,000 calls = $0.01 per search
    web_search_cost = web_search_count * 0.01

    return (
        cached_input_tokens * (cached_input_pm / 1_000_000) +
        (input_tokens - cached_input_tokens) * (input_tokens_pm / 1_000_000) +
        total_output * (output_pm / 1_000_000) +
        web_search_cost
    )
