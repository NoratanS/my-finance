package com.myfinance.backend.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/**
 * One row of {@code GET /api/transactions/category-totals}: the summed amount of the matching
 * transactions filed on one category, in one currency. As filed, per currency — same reasoning as
 * {@link CategoryTransactionCount} and {@link TransactionSummary}.
 */
public record CategoryTotal(
        Long categoryId,
        String currency,
        @Schema(type = "string", format = "decimal", example = "243.5000") BigDecimal total) {
}
