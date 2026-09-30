package com.myfinance.backend.dto;

import java.math.BigDecimal;

/**
 * One row of {@code GET /api/transactions/category-totals}: the summed amount of the matching
 * transactions filed on one category, in one currency. As filed, per currency — same reasoning as
 * {@link CategoryTransactionCount} and {@link TransactionSummary}.
 */
public record CategoryTotal(Long categoryId, String currency, BigDecimal total) {}
