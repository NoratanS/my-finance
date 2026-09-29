package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Same password rules as {@link RegisterRequest}; the 72-byte limit comes from {@link BcryptPassword}. */
public record SetPasswordRequest(
        @NotBlank @Size(min = 12, max = 128) String password) implements BcryptPassword {}
