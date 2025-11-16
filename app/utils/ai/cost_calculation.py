def calculate_cost(model: str, input_tokens: int, cached_input_tokens: int, output_tokens: int, reasoning_tokens: int) -> float | None:
    input_tokens_pm: float
    cached_input_pm: float
    output_pm: float

    match model:
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

    return (
        cached_input_tokens * (cached_input_pm / 1_000_000) +
        (input_tokens - cached_input_tokens) * (input_tokens_pm / 1_000_000) +
        output_tokens * (output_pm / 1_000_000)
    )
