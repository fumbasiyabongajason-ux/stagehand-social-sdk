"""Session manager — mirror of packages/typescript/src/core/session.ts."""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from browserbase import Browserbase

from stagehand_social.core.errors import SessionError
from stagehand_social.core.types import (
    GenericTarget,
    PlatformTarget,
    SessionRef,
    TargetKey,
)

_DEFAULT_SESSION_DIR = Path.home() / ".stagehand-social"
_SESSIONS_FILE = "sessions.json"


def _target_key_id(target: TargetKey) -> str:
    if isinstance(target, PlatformTarget):
        return target.platform
    return f"generic:{target.site_id}"


def _ref_key(target: TargetKey, account: str) -> str:
    return f"{_target_key_id(target)}::{account}"


def _target_to_dict(target: TargetKey) -> dict:
    return asdict(target)


def _target_from_dict(d: dict) -> TargetKey:
    if d.get("kind") == "platform":
        return PlatformTarget(platform=d["platform"])
    return GenericTarget(site_id=d["site_id"])


class SessionManager:
    """One Browserbase context per (target, account); persisted on disk."""

    def __init__(
        self,
        api_key: str,
        project_id: str,
        session_dir: Optional[str] = None,
    ):
        self.session_dir: Path = Path(session_dir) if session_dir else _DEFAULT_SESSION_DIR
        self.bb = Browserbase(api_key=api_key)
        self.project_id = project_id
        self._cache: dict[str, SessionRef] = {}
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        try:
            self.session_dir.mkdir(parents=True, exist_ok=True)
            file_path = self.session_dir / _SESSIONS_FILE
            if file_path.exists():
                raw = json.loads(file_path.read_text())
                self._cache = {
                    k: SessionRef(
                        target=_target_from_dict(v["target"]),
                        account=v["account"],
                        context_id=v["context_id"],
                        last_verified_at=v.get("last_verified_at"),
                    )
                    for k, v in raw.items()
                }
        except Exception as e:
            raise SessionError(f"Failed to load session cache from {self.session_dir}", e) from e
        self._loaded = True

    def _persist(self) -> None:
        file_path = self.session_dir / _SESSIONS_FILE
        serialized = {
            k: {
                "target": _target_to_dict(v.target),
                "account": v.account,
                "context_id": v.context_id,
                "last_verified_at": v.last_verified_at,
            }
            for k, v in self._cache.items()
        }
        file_path.write_text(json.dumps(serialized, indent=2))

    def get(self, target: TargetKey, account: str) -> Optional[SessionRef]:
        self._ensure_loaded()
        return self._cache.get(_ref_key(target, account))

    def get_or_create_context(self, target: TargetKey, account: str) -> str:
        """Return an existing contextId for (target, account), or create one."""
        self._ensure_loaded()
        existing = self._cache.get(_ref_key(target, account))
        if existing is not None:
            return existing.context_id

        ctx = self.bb.contexts.create(project_id=self.project_id)
        ref = SessionRef(target=target, account=account, context_id=ctx.id)
        self._cache[_ref_key(target, account)] = ref
        self._persist()
        return ctx.id

    def mark_verified(self, target: TargetKey, account: str) -> None:
        self._ensure_loaded()
        ref = self._cache.get(_ref_key(target, account))
        if ref is None:
            return
        ref.last_verified_at = datetime.now(tz=timezone.utc).isoformat()
        self._persist()

    def forget(self, target: TargetKey, account: str) -> None:
        self._ensure_loaded()
        self._cache.pop(_ref_key(target, account), None)
        self._persist()

    def list(self) -> list[SessionRef]:
        self._ensure_loaded()
        return list(self._cache.values())

    def build_session_params(self, context_id: str) -> dict:
        """Stagehand-compatible session params."""
        return {
            "project_id": self.project_id,
            "browser_settings": {
                "context": {"id": context_id, "persist": True},
            },
        }
