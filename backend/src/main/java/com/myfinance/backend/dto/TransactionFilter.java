package com.myfinance.backend.dto;

import com.myfinance.backend.model.TransactionType;

import java.time.LocalDate;

/**
 * Internal parameter object assembled by the controller from the query params of
 * {@code GET /api/transactions} — not a request body, so Bean Validation annotations here would
 * not fire; validation (from/to order, includeDescendants needs categoryId, paging bounds) lives
 * in {@code TransactionService.validate}.
 */
public record TransactionFilter(
        LocalDate from,
        LocalDate to,
        Long categoryId,
        boolean includeDescendants,
        TransactionType type,
        int page,
        int size
) {
}
