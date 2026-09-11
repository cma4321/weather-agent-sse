"""Serialise LangChain StreamEvents as Server-Sent Events frames."""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


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
    """Encode each event; if encoding itself fails, emit one error frame and stop."""
    try:
        async for event in events:
            yield encode_frame(event)
    except Exception as exc:  # surfaced to the client as a final frame
        logger.exception("sse encoding failed")
        yield encode_frame({"event": "error", "data": {"message": str(exc)}})
