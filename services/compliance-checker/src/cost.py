"""Token usage tracking for local Ollama inference."""


def format_token_usage(input_tokens: int, output_tokens: int) -> str:
    return f"{input_tokens:,} in / {output_tokens:,} out"
