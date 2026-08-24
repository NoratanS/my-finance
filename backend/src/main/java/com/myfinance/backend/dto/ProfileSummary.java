package com.myfinance.backend.dto;

import com.myfinance.backend.model.Profile;

/** Compact profile shape embedded in session responses (login, me, active-profile). */
public record ProfileSummary(Long id, String name, String defaultCurrency) {

    public static ProfileSummary from(Profile profile) {
        return new ProfileSummary(profile.getId(), profile.getName(), profile.getDefaultCurrency());
    }
}
