package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** Body of {@code POST /api/categories}; {@code parentId == null} creates a root, {@code color == null} inherits. */
public record CreateCategoryRequest(
        @NotBlank @Size(max = 100) String name,
        @Schema(nullable = true) Long parentId,

        @Schema(nullable = true)
        @Pattern(regexp = "^#[0-9a-f]{6}$", message = "must be a lowercase hex color like #a4d9c6")
        String color) {}
