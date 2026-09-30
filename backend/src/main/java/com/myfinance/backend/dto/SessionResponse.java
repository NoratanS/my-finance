package com.myfinance.backend.dto;

import java.util.List;

import com.myfinance.backend.config.AuthMode;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Returned by login and {@code GET /api/auth/me}: who is logged in, their profiles, which one is
 * active, and how this instance authenticates — {@code authMode} is how the frontend knows whether
 * to offer a login screen at all (docs/API.md "Auth").
 */
public record SessionResponse(
        SessionUser user,
        List<ProfileSummary> profiles,
        @Schema(nullable = true) Long activeProfileId,
        AuthMode authMode) {

    public record SessionUser(Long id, String email, String displayName) {}
}
