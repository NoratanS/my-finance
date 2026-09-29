package com.myfinance.backend.dto;

/**
 * One row of {@code GET /api/transactions/category-counts}: how many transactions are filed on a
 * category. Counted as filed — no subtree roll-up, because the client already holds the tree and
 * rolls up whichever way its screen needs.
 */
public record CategoryTransactionCount(Long categoryId, long count) {}
