from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from phywise_api.db import get_session
from phywise_api.models import SourceAssetRecord
from phywise_api.schemas import SourceAsset
from phywise_api.services.assets import create_source_asset
from phywise_api.storage import storage

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("", response_model=SourceAsset)
async def create_upload(
    file: UploadFile | None = File(default=None),
    text_content: str | None = Form(default=None),
    filename: str | None = Form(default=None),
    session: Session = Depends(get_session),
) -> SourceAsset:
    return await create_source_asset(session, file, text_content, filename)


@router.get("/{asset_id}/content")
def get_asset_content(asset_id: str, session: Session = Depends(get_session)) -> FileResponse:
    record = session.get(SourceAssetRecord, asset_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return FileResponse(storage.resolve(record.storage_key), media_type=record.mime_type, filename=record.filename)


@router.get("/previews/{preview_key:path}")
def get_preview_content(preview_key: str) -> FileResponse:
    path = storage.resolve(preview_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Preview not found.")
    return FileResponse(path, media_type="image/png", filename=Path(preview_key).name)
