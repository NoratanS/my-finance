package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** Body of {@code POST /api/categories}; {@code parentId == null} creates a root, {@code color == null} inherits. */
public record CreateCategoryRequest(
        @NotBlank @Size(max = 100) String name,
        @Schema(nullable = true) Long parentId,
        @Schema(nullable = true) @HexColor String color) {}
