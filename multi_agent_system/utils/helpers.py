import json
import hashlib
from typing import Any, Dict, List, Optional
from datetime import datetime


def generate_id(prefix: str = "") -> str:
    """Generate a unique ID."""
    timestamp = datetime.now().isoformat()
    hash_input = f"{prefix}{timestamp}".encode()
    short_hash = hashlib.md5(hash_input).hexdigest()[:8]
    return f"{prefix}_{short_hash}" if prefix else short_hash


def truncate_text(text: str, max_length: int = 500) -> str:
    """Truncate text to max length with ellipsis."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def format_results_table(results: List[Dict[str, Any]]) -> str:
    """Format a list of results as a simple text table."""
    if not results:
        return "No results."

    lines = []
    for i, result in enumerate(results, 1):
        lines.append(f"--- Result {i} ---")
        for key, value in result.items():
            if isinstance(value, str) and len(value) > 100:
                value = value[:100] + "..."
            lines.append(f"  {key}: {value}")
        lines.append("")

    return "\n".join(lines)


def safe_json_loads(text: str, default: Any = None) -> Any:
    """Safely parse JSON with fallback."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return default


def merge_dicts(*dicts: Dict) -> Dict:
    """Deep merge multiple dictionaries."""
    result = {}
    for d in dicts:
        for key, value in d.items():
            if (
                key in result
                and isinstance(result[key], dict)
                and isinstance(value, dict)
            ):
                result[key] = merge_dicts(result[key], value)
            else:
                result[key] = value
    return result


def estimate_tokens(text: str) -> int:
    """Rough estimate of token count (1 token ≈ 4 chars for English)."""
    return len(text) // 4