from __future__ import annotations

import hashlib
import re
import uuid
from datetime import UTC, datetime


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def slugify_filename(filename: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", filename.strip())
    return sanitized or "asset"


def digest_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()

