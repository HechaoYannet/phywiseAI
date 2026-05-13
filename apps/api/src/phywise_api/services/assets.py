from __future__ import annotations

import mimetypes
from pathlib import Path

import fitz
from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from phywise_api.models import SourceAssetRecord
from phywise_api.schemas import PageRegion, SourceAsset
from phywise_api.services.common import digest_bytes, make_id, now_iso, slugify_filename
from phywise_api.storage import storage


def infer_asset_kind(filename: str, mime_type: str, has_text: bool) -> str:
    if has_text:
        if filename.endswith(".tex"):
            return "latex"
        return "markdown"
    if mime_type == "application/pdf" or filename.lower().endswith(".pdf"):
        return "pdf"
    if mime_type.startswith("image/"):
        return "image"
    return "other"


def preview_pages_from_pdf(pdf_bytes: bytes, asset_id: str, filename: str, max_pages: int = 3) -> tuple[int, list[PageRegion]]:
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_regions: list[PageRegion] = []

    for page_index, page in enumerate(document, start=1):
        if page_index > max_pages:
            break
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
        preview_key = f"previews/{asset_id}/page-{page_index}.png"
        storage.write_bytes(preview_key, pixmap.tobytes("png"))
        page_regions.append(
            PageRegion(
                id=f"{asset_id}-page-{page_index}",
                page=page_index,
                label=f"{Path(filename).stem} 第 {page_index} 页",
                preview_key=preview_key,
                width=pixmap.width,
                height=pixmap.height,
            )
        )

    page_count = document.page_count
    document.close()
    return page_count, page_regions


async def create_source_asset(
    session: Session,
    upload: UploadFile | None,
    text_content: str | None,
    provided_filename: str | None,
) -> SourceAsset:
    if upload is None and not text_content:
        raise HTTPException(status_code=400, detail="Either file or text_content is required.")

    if upload is not None:
        content = await upload.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        filename = upload.filename or "upload.bin"
        mime_type = upload.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        kind = infer_asset_kind(filename, mime_type, False)
        digest = digest_bytes(content)

        existing = session.scalar(select(SourceAssetRecord).where(SourceAssetRecord.sha256 == digest))
        if existing is not None:
            return SourceAsset.model_validate(existing.__dict__)

        asset_id = make_id("asset")
        storage_key = f"assets/{asset_id}-{slugify_filename(filename)}"
        storage.write_bytes(storage_key, content)

        page_count = None
        preview_pages: list[PageRegion] = []
        if kind == "pdf":
            page_count, preview_pages = preview_pages_from_pdf(content, asset_id, filename)

        record = SourceAssetRecord(
            id=asset_id,
            kind=kind,
            filename=filename,
            mime_type=mime_type,
            bytes=len(content),
            object_key=storage_key,
            storage_key=storage_key,
            sha256=digest,
            page_count=page_count,
            preview_pages=[item.model_dump() for item in preview_pages],
            source_provider="upload",
            created_at=now_iso(),
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return SourceAsset.model_validate(record.__dict__)

    filename = provided_filename or "manual-input.md"
    kind = infer_asset_kind(filename, "text/markdown", True)
    content = text_content or ""
    content_bytes = content.encode("utf-8")
    digest = digest_bytes(content_bytes)

    existing = session.scalar(select(SourceAssetRecord).where(SourceAssetRecord.sha256 == digest))
    if existing is not None:
        return SourceAsset.model_validate(existing.__dict__)

    asset_id = make_id("asset")
    storage_key = f"assets/{asset_id}-{slugify_filename(filename)}"
    storage.write_text(storage_key, content)
    record = SourceAssetRecord(
        id=asset_id,
        kind=kind,
        filename=filename,
        mime_type="text/markdown",
        bytes=len(content_bytes),
        object_key=storage_key,
        storage_key=storage_key,
        sha256=digest,
        page_count=1,
        preview_pages=[],
        source_provider="manual_text",
        created_at=now_iso(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return SourceAsset.model_validate(record.__dict__)
