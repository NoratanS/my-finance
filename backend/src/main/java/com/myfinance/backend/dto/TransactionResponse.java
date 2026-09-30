package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.myfinance.backend.model.TransactionType;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A transaction as returned by every transaction endpoint. {@code amount} is written as a JSON
 * string ("34.9900") so its scale survives and no client parses it into a float (docs/API.md "Money").
 * Built from a {@link com.myfinance.backend.model.Transaction} by
 * {@link com.myfinance.backend.mapper.TransactionMapper}.
 */
public record TransactionResponse(
        Long id,
        CategoryRef category,
        BigDecimal amount,
        String currency,
        TransactionType type,
        LocalDate occurredOn,
        @Schema(nullable = true) String description,
        @Schema(nullable = true) String merchant,
        @Schema(nullable = true) Long subscriptionId,
        OffsetDateTime createdAt) {}
