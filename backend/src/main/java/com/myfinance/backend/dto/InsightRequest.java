package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;

import tools.jackson.databind.JsonNode;

/**
 * Body of {@code POST} and {@code PUT /api/insights} (docs/API.md "Insights"). {@code plan} is
 * only checked for being a JSON object — every other plan rule belongs to the executor, so the
 * two validators cannot drift. {@code pinned} is a primitive: absent means {@code false}; Jackson 3
 * otherwise rejects a missing primitive record component outright (see docs/LESSONS.md), so
 * {@code @JsonSetter(nulls = Nulls.AS_EMPTY)} substitutes {@code false} for "absent" and "explicit
 * null" alike — {@code Nulls.SKIP} does not have this effect for a record's canonical constructor.
 */
public record InsightRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull JsonNode plan,
        JsonNode viz,
        @JsonSetter(nulls = Nulls.AS_EMPTY) boolean pinned) {}
