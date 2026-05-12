from fastapi import FastAPI

from phywise_api.config import get_settings
from phywise_api.routes import assignments, health, problems, simulations, tutor, uploads, workspaces

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Protocol-first API skeleton for the Phywise tutoring workspace.",
)

app.include_router(health.router)
app.include_router(uploads.router)
app.include_router(problems.router)
app.include_router(workspaces.router)
app.include_router(tutor.router)
app.include_router(simulations.router)
app.include_router(assignments.router)
