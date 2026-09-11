"""Serialise LangChain StreamEvents as Server-Sent Events frames."""

import json
from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel


def json_default(obj: Any) -> Any:
    """Make messages/chunks (pydantic models) JSON-friendly; stringify anything else."""
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    return str(obj)


def encode_frame(event: dict[str, Any]) -> str:
    """One SSE frame: the event type plus the whole StreamEvent as JSON."""
    payload = json.dumps(event, default=json_default, ensure_ascii=False)
    return f"event: {event['event']}\ndata: {payload}\n\n"


async def to_sse(events: AsyncIterator[dict[str, Any]]) -> AsyncIterator[str]:
    async for event in events:
        yield encode_frame(event)
