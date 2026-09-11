"""HTTP surface for the agent. Knows nothing about graphs or LangChain."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent.service import AgentService
from app.api.deps import get_agent
from app.sse.encoder import to_sse

router = APIRouter(prefix="/agent", tags=["agent"])


class ExecuteRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.post("/execute")
async def execute(body: ExecuteRequest, agent: AgentService = Depends(get_agent)) -> StreamingResponse:
    """Hand the agent's event stream straight to the client as SSE."""
    return StreamingResponse(
        to_sse(agent.stream(body.message)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
