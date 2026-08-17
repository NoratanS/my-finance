package com.myfinance.backend.dto;

import java.util.List;

/** Returned by login and {@code GET /api/auth/me}: who is logged in, their profiles, and which one is active. */
public record SessionResponse(SessionUser user, List<ProfileSummary> profiles, Long activeProfileId) {

    public record SessionUser(Long id, String email, String displayName) {
    }
}
