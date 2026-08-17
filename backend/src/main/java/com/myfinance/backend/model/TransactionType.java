package com.myfinance.backend.model;

/** Direction of a transaction. Amounts are always positive; this column carries the sign. */
public enum TransactionType {
    EXPENSE,
    INCOME
}
