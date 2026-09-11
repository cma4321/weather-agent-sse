import asyncio

import pytest

from app.agent.tools import weather
from app.agent.tools.weather import get_weather


def test_tool_metadata():
    assert get_weather.name == "get_weather"
    assert list(get_weather.args.keys()) == ["city"]


async def test_returns_fixed_stub():
    result = await get_weather.ainvoke({"city": "São Paulo"})
    assert result == {"city": "São Paulo", "temp_c": 22, "condition": "parcialmente nublado"}


async def test_sleeps_for_configured_delay(monkeypatch):
    monkeypatch.setenv("WEATHER_DELAY_SECONDS", "1.5")
    weather.get_settings.cache_clear()
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    await get_weather.ainvoke({"city": "Rio"})
    assert slept == [1.5]
