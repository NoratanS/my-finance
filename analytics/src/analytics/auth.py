"""Bearer-token authentication for the internal analytics API."""

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from analytics.config import Settings, get_settings

# auto_error=False so a missing header arrives here as None and earns the same
# 401 as a wrong one; HTTPBearer's own error for a missing header is a 403.
bearer_scheme = HTTPBearer(auto_error=False)


def require_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """The backend is the only caller (docs/INSIGHTS.md → "The analytics
    service"). compare_digest rather than ==, the usual constant-time habit for
    comparing a secret."""
    if credentials is None or not secrets.compare_digest(
        credentials.credentials, settings.analytics_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid bearer token",
        )
