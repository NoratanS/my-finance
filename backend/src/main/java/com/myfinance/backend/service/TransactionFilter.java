package com.myfinance.backend.service;

import java.time.LocalDate;

import com.myfinance.backend.model.TransactionType;

/**
 * Internal parameter object assembled by the controller from the query params of
 * {@code GET /api/transactions} and its aggregates — not a request body, so Bean Validation
 * annotations here would not fire; its rules (from/to order, includeDescendants needs categoryId,
 * the search term's length) are checked where it becomes a query, in {@code TransactionService}.
 * Paging is not part of it: only the list pages.
 */
public record TransactionFilter(
        LocalDate from, LocalDate to, Long categoryId, boolean includeDescendants, TransactionType type, String q) {}
