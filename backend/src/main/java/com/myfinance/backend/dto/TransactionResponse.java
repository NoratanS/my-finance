package com.myfinance.backend.dto;

import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A transaction as returned by every transaction endpoint. {@code amount} is written as a JSON
 * string ("34.9900") so its scale survives and no client parses it into a float (docs/API.md "Money").
 */
public record TransactionResponse(
        Long id,
        CategoryRef category,
        BigDecimal amount,
        String currency,
        TransactionType type,
        LocalDate occurredOn,
        String description,
        OffsetDateTime createdAt
) {

    public static TransactionResponse from(Transaction transaction) {
        return new TransactionResponse(
                transaction.getId(),
                CategoryRef.from(transaction.getCategory()),
                transaction.getAmount(),
                transaction.getCurrency(),
                transaction.getType(),
                transaction.getOccurredOn(),
                transaction.getDescription(),
                transaction.getCreatedAt());
    }
}
