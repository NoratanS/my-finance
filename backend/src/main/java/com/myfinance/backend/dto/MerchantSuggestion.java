package com.myfinance.backend.dto;

/**
 * One backfill candidate: a description shared by several transactions that have no merchant yet.
 * The suggested merchant is the description itself — the client edits it before applying.
 */
public record MerchantSuggestion(String description, long transactionCount) {}
