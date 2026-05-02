"""stagehand-social — Stagehand-powered SDK for social platforms and arbitrary websites."""

from stagehand_social.core.errors import (
    AuthenticationError,
    ChallengeError,
    ConfigError,
    ElementNotFoundError,
    MfaRequiredError,
    RateLimitError,
    SessionError,
    SocialSDKError,
)
from stagehand_social.core.mfa import generate_totp_code, resolve_mfa
from stagehand_social.core.session import SessionManager
from stagehand_social.core.social_sdk import SocialSDK
from stagehand_social.core.types import (
    ActionResult,
    BrowserbaseConfig,
    CommentInput,
    CommentResult,
    Credentials,
    FollowInput,
    FollowResult,
    GenericLoginInput,
    LikeInput,
    LikeResult,
    LLMConfig,
    MfaChallenge,
    PlatformName,
    PostInput,
    PostResult,
    SessionRef,
    SocialSDKConfig,
    TargetKey,
)
from stagehand_social.generic.generic_site import GenericSiteAdapter
from stagehand_social.platforms.facebook import FacebookAdapter
from stagehand_social.platforms.instagram import InstagramAdapter
from stagehand_social.platforms.linkedin import LinkedInAdapter
from stagehand_social.platforms.threads import ThreadsAdapter
from stagehand_social.platforms.tiktok import TikTokAdapter
from stagehand_social.platforms.x import XAdapter
from stagehand_social.platforms.youtube import YouTubeAdapter

__version__ = "0.1.0"

__all__ = [
    "SocialSDK",
    "SessionManager",
    "GenericSiteAdapter",
    "InstagramAdapter",
    "TikTokAdapter",
    "XAdapter",
    "FacebookAdapter",
    "YouTubeAdapter",
    "LinkedInAdapter",
    "ThreadsAdapter",
    # Types
    "Credentials",
    "PostInput",
    "CommentInput",
    "LikeInput",
    "FollowInput",
    "PostResult",
    "CommentResult",
    "LikeResult",
    "FollowResult",
    "ActionResult",
    "GenericLoginInput",
    "MfaChallenge",
    "PlatformName",
    "TargetKey",
    "SessionRef",
    "BrowserbaseConfig",
    "LLMConfig",
    "SocialSDKConfig",
    # Errors
    "SocialSDKError",
    "AuthenticationError",
    "MfaRequiredError",
    "ChallengeError",
    "RateLimitError",
    "ElementNotFoundError",
    "SessionError",
    "ConfigError",
    # MFA helpers
    "generate_totp_code",
    "resolve_mfa",
]
