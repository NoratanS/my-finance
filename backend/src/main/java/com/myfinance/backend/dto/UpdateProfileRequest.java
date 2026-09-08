package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code PUT /api/profiles/{id}} — rename only; the default currency is fixed at creation. */
public record UpdateProfileRequest(
        @NotBlank @Size(max = 100) String name) {}
