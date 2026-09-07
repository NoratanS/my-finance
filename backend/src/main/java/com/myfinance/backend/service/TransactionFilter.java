package com.myfinance.backend.service;

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

    /**
     * The same filters without paging, for the aggregate endpoints: they cover every matching row,
     * so {@code page}/{@code size} mean nothing there and are fixed at values {@code validate}
     * accepts rather than given a second validation path.
     */
    public TransactionFilter(LocalDate from, LocalDate to, Long categoryId, boolean includeDescendants,
                             TransactionType type) {
        this(from, to, categoryId, includeDescendants, type, 0, 1);
    }
}
