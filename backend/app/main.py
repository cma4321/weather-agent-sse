"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.service import create_agent_service
from app.api.agent_router import router as agent_router
from app.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.agent = create_agent_service(get_settings())
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Praxis P1 - Weather Agent", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(agent_router)
    return app


app = create_app()
