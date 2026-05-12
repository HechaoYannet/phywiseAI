from fastapi import APIRouter

from phywise_api.schemas import SourceAsset
from phywise_api.services.demo import demo_asset

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("", response_model=SourceAsset)
def create_upload() -> SourceAsset:
    return demo_asset()

