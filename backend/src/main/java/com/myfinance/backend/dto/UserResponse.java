package com.myfinance.backend.dto;

import com.myfinance.backend.model.User;

import java.time.OffsetDateTime;

/** Registration response. Never carries the password hash. */
public record UserResponse(Long id, String email, String displayName, OffsetDateTime createdAt) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getCreatedAt());
    }
}
