"""FastAPI dependencies."""

from fastapi import Request

from app.agent.service import AgentService


def get_agent(request: Request) -> AgentService:
    """The single AgentService built at startup (see app.main.lifespan)."""
    return request.app.state.agent
