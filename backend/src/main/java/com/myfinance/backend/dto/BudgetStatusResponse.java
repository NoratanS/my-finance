package com.myfinance.backend.dto;


import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.List;

/**
 * Spend against limit for one budget (docs/API.md "GET /api/budgets/{id}/status").
 * {@code percentUsed} is a plain number (display ratio), the money fields are decimal strings.
 */
public record BudgetStatusResponse(
        BudgetSummary budget,
        @Schema(type = "string", format = "decimal", example = "243.5000") BigDecimal spent,
        @Schema(type = "string", format = "decimal", example = "243.5000") BigDecimal remaining,
        double percentUsed,
        boolean overBudget,
        boolean includesDescendants,
        List<String> excludedCurrencies) {
}
