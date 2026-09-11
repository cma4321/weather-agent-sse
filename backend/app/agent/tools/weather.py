"""Weather tool stub: no HTTP, fixed answer, configurable latency."""

import asyncio

from langchain_core.tools import tool

from app.config import get_settings


@tool
async def get_weather(city: str) -> dict:
    """Return the current weather for the given city."""
    await asyncio.sleep(get_settings().weather_delay_seconds)
    return {"city": city, "temp_c": 22, "condition": "parcialmente nublado"}
