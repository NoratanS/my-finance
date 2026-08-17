package com.myfinance.backend.dto;

import com.myfinance.backend.model.TransactionType;

import java.time.LocalDate;

/**
 * The optional query parameters of {@code GET /api/transactions}, bundled so the controller
 * signature stays short. Cross-field rules (from/to order, includeDescendants needs categoryId,
 * paging bounds) are checked in {@code TransactionService}.
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
