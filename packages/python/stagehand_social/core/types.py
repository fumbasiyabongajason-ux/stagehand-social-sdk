"""Core types — mirror of packages/typescript/src/core/types.ts.

Keep field names + semantics identical between languages.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal, Optional, Union

# ---------------------------------------------------------------------------
# Identity & sessions
# ---------------------------------------------------------------------------

PlatformName = Literal[
    "instagram",
    "tiktok",
    "x",
    "facebook",
    "youtube",
    "linkedin",
    "threads",
]


@dataclass
class PlatformTarget:
    platform: PlatformName
    kind: Literal["platform"] = "platform"


@dataclass
class GenericTarget:
    site_id: str
    kind: Literal["generic"] = "generic"


TargetKey = Union[PlatformTarget, GenericTarget]


@dataclass
class Credentials:
    username: str
    password: str
    totp_secret: Optional[str] = None


@dataclass
class MfaChallenge:
    description: str
    channel: Literal["sms", "email", "authenticator", "unknown"] = "unknown"
    hint: Optional[str] = None


MfaCallback = Callable[[MfaChallenge], Awaitable[str]]


@dataclass
class SessionRef:
    target: TargetKey
    account: str
    context_id: str
    last_verified_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Action inputs
# ---------------------------------------------------------------------------


@dataclass
class PostInput:
    text: Optional[str] = None
    media: Optional[list[str]] = None
    alt_text: Optional[list[str]] = None
    location: Optional[str] = None
    mentions: Optional[list[str]] = None
    hashtags: Optional[list[str]] = None


@dataclass
class CommentInput:
    url: str
    text: str
    reply_to: Optional[str] = None


@dataclass
class LikeInput:
    url: str


@dataclass
class FollowInput:
    username: str


# ---------------------------------------------------------------------------
# Action results
# ---------------------------------------------------------------------------


@dataclass
class ActionResult:
    success: bool
    at: int  # Unix epoch ms
    url: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class PostResult(ActionResult):
    post_url: Optional[str] = None
    post_id: Optional[str] = None


@dataclass
class CommentResult(ActionResult):
    comment_id: Optional[str] = None


@dataclass
class LikeResult(ActionResult):
    liked: bool = True


@dataclass
class FollowResult(ActionResult):
    following: bool = True


# ---------------------------------------------------------------------------
# Generic site
# ---------------------------------------------------------------------------


@dataclass
class GenericLoginInput:
    login_url: str
    username_field: Optional[str] = None
    password_field: Optional[str] = None
    submit: Optional[str] = None
    has_username: bool = True
    credentials: Optional[Credentials] = None


# ---------------------------------------------------------------------------
# SDK config
# ---------------------------------------------------------------------------


@dataclass
class BrowserbaseConfig:
    api_key: str
    project_id: str


@dataclass
class LLMConfig:
    provider: Literal["anthropic", "openai"]
    api_key: str
    model: Optional[str] = None


@dataclass
class SocialSDKConfig:
    browserbase: BrowserbaseConfig
    llm: LLMConfig
    on_mfa_challenge: Optional[MfaCallback] = None
    session_dir: Optional[str] = None
    headless: bool = True
    log_level: Literal["debug", "info", "warn", "error"] = "info"
