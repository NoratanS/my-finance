package com.myfinance.backend.dto;

import java.util.List;

import com.myfinance.backend.config.AuthMode;

/**
 * Returned by login and {@code GET /api/auth/me}: who is logged in, their profiles, which one is
 * active, and how this instance authenticates — {@code authMode} is how the frontend knows whether
 * to offer a login screen at all (docs/API.md "Auth").
 */
public record SessionResponse(
        SessionUser user, List<ProfileSummary> profiles, Long activeProfileId, AuthMode authMode) {

    public record SessionUser(Long id, String email, String displayName) {}
}
