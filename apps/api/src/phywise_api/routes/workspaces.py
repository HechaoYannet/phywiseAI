from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from phywise_api.db import get_session
from phywise_api.schemas import (
    AnalyzeBoardInput,
    AnalyzeSourceInput,
    CreateWorkspaceInput,
    UpdateWorkspaceInput,
    WorkspaceDocument,
    WorkspaceRevision,
)
from phywise_api.services.assets import create_source_asset
from phywise_api.services.parsing import load_problem
from phywise_api.services.workspaces import (
    accept_workspace_suggestion,
    analyze_workspace_board,
    analyze_workspace_source,
    apply_parse_overrides,
    attach_source_to_workspace,
    create_workspace,
    load_workspace,
    load_workspace_revisions,
    reject_workspace_suggestion,
    save_workspace,
)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.post("", response_model=WorkspaceDocument)
def create_workspace_route(
    input_data: CreateWorkspaceInput,
    session: Session = Depends(get_session),
) -> WorkspaceDocument:
    parse_result = None
    if input_data.problem_id:
        parse_result = load_problem(session, input_data.problem_id)
        if parse_result is None:
            raise HTTPException(status_code=404, detail="Problem not found.")
        parse_result = apply_parse_overrides(parse_result, input_data.parse_overrides)
    return create_workspace(session, input_data, parse_result)


@router.get("/{workspace_id}", response_model=WorkspaceDocument)
def get_workspace(workspace_id: str, session: Session = Depends(get_session)) -> WorkspaceDocument:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@router.patch("/{workspace_id}", response_model=WorkspaceDocument)
def patch_workspace(
    workspace_id: str,
    input_data: UpdateWorkspaceInput,
    session: Session = Depends(get_session),
) -> WorkspaceDocument:
    workspace = save_workspace(session, workspace_id, input_data)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@router.post("/{workspace_id}/sources", response_model=WorkspaceDocument)
async def attach_workspace_source(
    workspace_id: str,
    file: UploadFile | None = File(default=None),
    text_content: str | None = Form(default=None),
    filename: str | None = Form(default=None),
    session: Session = Depends(get_session),
) -> WorkspaceDocument:
    asset = await create_source_asset(session, file, text_content, filename)
    workspace = attach_source_to_workspace(session, workspace_id, asset.id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@router.post("/{workspace_id}/analyze-source", response_model=WorkspaceDocument)
def analyze_source_route(
    workspace_id: str,
    input_data: AnalyzeSourceInput,
    session: Session = Depends(get_session),
) -> WorkspaceDocument:
    workspace = analyze_workspace_source(session, workspace_id, input_data.source_asset_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace or source asset not found.")
    return workspace


@router.post("/{workspace_id}/analyze-board", response_model=WorkspaceDocument)
def analyze_board_route(
    workspace_id: str,
    input_data: AnalyzeBoardInput,
    session: Session = Depends(get_session),
) -> WorkspaceDocument:
    workspace = analyze_workspace_board(session, workspace_id, input_data)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@router.post("/{workspace_id}/suggestions/{suggestion_id}/accept", response_model=WorkspaceDocument)
def accept_suggestion_route(
    workspace_id: str,
    suggestion_id: str,
    session: Session = Depends(get_session),
) -> WorkspaceDocument:
    workspace = accept_workspace_suggestion(session, workspace_id, suggestion_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@router.post("/{workspace_id}/suggestions/{suggestion_id}/reject", response_model=WorkspaceDocument)
def reject_suggestion_route(
    workspace_id: str,
    suggestion_id: str,
    session: Session = Depends(get_session),
) -> WorkspaceDocument:
    workspace = reject_workspace_suggestion(session, workspace_id, suggestion_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@router.get("/{workspace_id}/revisions", response_model=list[WorkspaceRevision])
def get_workspace_revisions(workspace_id: str, session: Session = Depends(get_session)) -> list[WorkspaceRevision]:
    return load_workspace_revisions(session, workspace_id)
