from fastapi import APIRouter

from phywise_api.schemas import CreateWorkspaceInput, WorkspaceDocument
from phywise_api.services.demo import demo_workspace

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.post("", response_model=WorkspaceDocument)
def create_workspace(_: CreateWorkspaceInput) -> WorkspaceDocument:
    return demo_workspace()

