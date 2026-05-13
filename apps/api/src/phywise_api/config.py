from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Phywise API"
    app_env: str = "development"
    public_origin: str = "http://localhost:3000"
    api_origin: str = "http://localhost:8000"
    database_url: str = "sqlite:///storage/phywise.db"
    storage_root: str = "storage"
    storage_bucket: str = "phywise-assets"
    parse_execution_mode: Literal["inline", "rq"] = "inline"
    redis_url: str = "redis://localhost:6379/0"
    paddleocr_enabled: bool = True
    max_preview_pages: int = 3
    tencent_secret_id: str = ""
    tencent_secret_key: str = ""
    tencent_region: str = "ap-beijing"
    vision_model: str = "vision-model-placeholder"
    reasoning_model: str = "reasoning-model-placeholder"

    model_config = SettingsConfigDict(
        env_prefix="PHYWISE_",
        extra="ignore",
    )

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_root)


@lru_cache
def get_settings() -> Settings:
    return Settings()
