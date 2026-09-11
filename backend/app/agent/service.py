"""AgentService: runs the compiled graph and yields LangChain StreamEvents."""

import logging
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph.state import CompiledStateGraph

from app.agent.graph import build_graph
from app.agent.tools.weather import get_weather
from app.config import Settings

logger = logging.getLogger(__name__)

INCLUDE_TYPES = ["chat_model", "tool"]


class AgentService:
    def __init__(self, graph: CompiledStateGraph) -> None:
        self._graph = graph

    async def stream(self, message: str) -> AsyncIterator[dict[str, Any]]:
        """Yield every chat_model/tool StreamEvent (v2). On failure yield one error envelope and stop."""
        try:
            async for event in self._graph.astream_events(
                {"messages": [HumanMessage(content=message)]},
                version="v2",
                include_types=INCLUDE_TYPES,
            ):
                yield event
        except Exception as exc:  # noqa: BLE001 - surfaced to the client as a final frame
            logger.exception("agent stream failed")
            yield {"event": "error", "data": {"message": str(exc)}}


def create_agent_service(settings: Settings) -> AgentService:
    """Wire the real OpenAI model and the weather tool into a compiled graph."""
    llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, streaming=True)
    return AgentService(build_graph(llm, [get_weather]))
