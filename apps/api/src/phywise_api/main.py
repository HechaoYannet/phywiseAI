from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from phywise_api.config import get_settings
from phywise_api.db import Base, engine
from phywise_api import models  # noqa: F401
from phywise_api.routes import assignments, health, problems, simulations, tutor, uploads, workspaces
from phywise_api.storage import storage

settings = get_settings()


def initialize_runtime() -> None:
    storage.ensure_layout()
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_runtime()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Protocol-first API skeleton for the Phywise tutoring workspace.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.public_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(health.router)
app.include_router(uploads.router)
app.include_router(problems.router)
app.include_router(workspaces.router)
app.include_router(tutor.router)
app.include_router(simulations.router)
app.include_router(assignments.router)
