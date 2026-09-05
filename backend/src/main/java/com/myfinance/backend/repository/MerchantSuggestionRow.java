package com.myfinance.backend.repository;

/** Projection for {@link TransactionRepository#findMerchantSuggestions(Long)}. */
public interface MerchantSuggestionRow {

    String getDescription();

    long getTransactionCount();
}
