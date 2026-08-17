package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotNull;

/** The only request body in the API that carries a profile id (docs/API.md "Active profile"). */
public record ActiveProfileRequest(@NotNull Long profileId) {
}
