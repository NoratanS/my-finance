package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

/**
 * Body of {@code POST} and {@code PUT /api/insights} (docs/API.md "Insights"). {@code plan} is
 * only checked for being a JSON object — every other plan rule belongs to the executor, so the
 * two validators cannot drift. {@code pinned} is a primitive: absent means {@code false}.
 */
public record InsightRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull JsonNode plan,
        JsonNode viz,
        boolean pinned) {
}
