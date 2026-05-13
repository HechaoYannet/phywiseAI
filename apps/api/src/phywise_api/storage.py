from __future__ import annotations

from pathlib import Path

from phywise_api.config import get_settings

settings = get_settings()


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def ensure_layout(self) -> None:
        for dirname in ("assets", "previews", "tmp"):
            (self.root / dirname).mkdir(parents=True, exist_ok=True)

    def resolve(self, storage_key: str) -> Path:
        return self.root / storage_key

    def write_bytes(self, storage_key: str, content: bytes) -> Path:
        destination = self.resolve(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        return destination

    def write_text(self, storage_key: str, content: str) -> Path:
        destination = self.resolve(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")
        return destination

    def read_bytes(self, storage_key: str) -> bytes:
        return self.resolve(storage_key).read_bytes()

    def read_text(self, storage_key: str) -> str:
        return self.resolve(storage_key).read_text(encoding="utf-8")


storage = LocalStorage(settings.storage_path)
