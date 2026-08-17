package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of {@code POST /api/categories}; {@code parentId == null} creates a root. */
public record CreateCategoryRequest(
        @NotBlank @Size(max = 100) String name,
        Long parentId) {
}
