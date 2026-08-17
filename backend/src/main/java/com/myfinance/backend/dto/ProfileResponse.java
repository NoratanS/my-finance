package com.myfinance.backend.dto;

import com.myfinance.backend.model.Profile;

import java.time.OffsetDateTime;

public record ProfileResponse(Long id, String name, String defaultCurrency, OffsetDateTime createdAt) {

    public static ProfileResponse from(Profile profile) {
        return new ProfileResponse(profile.getId(), profile.getName(), profile.getDefaultCurrency(),
                profile.getCreatedAt());
    }
}
