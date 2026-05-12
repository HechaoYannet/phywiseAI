from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Phywise API"
    app_env: str = "development"
    public_origin: str = "http://localhost:3000"
    storage_bucket: str = "phywise-assets"
    vision_model: str = "vision-model-placeholder"
    reasoning_model: str = "reasoning-model-placeholder"

    model_config = SettingsConfigDict(
        env_prefix="PHYWISE_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

