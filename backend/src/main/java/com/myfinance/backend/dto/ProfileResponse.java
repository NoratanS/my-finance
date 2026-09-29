package com.myfinance.backend.dto;

import java.time.OffsetDateTime;

import com.myfinance.backend.model.Profile;

public record ProfileResponse(Long id, String name, String defaultCurrency, OffsetDateTime createdAt) {

    public static ProfileResponse from(Profile profile) {
        return new ProfileResponse(
                profile.getId(), profile.getName(), profile.getDefaultCurrency(), profile.getCreatedAt());
    }
}
