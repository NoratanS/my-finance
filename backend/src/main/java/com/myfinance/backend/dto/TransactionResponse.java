package com.myfinance.backend.dto;

import com.myfinance.backend.model.TransactionType;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A transaction as returned by every transaction endpoint. {@code amount} is written as a JSON
 * string ("34.9900") so its scale survives and no client parses it into a float (docs/API.md "Money").
 * Built from a {@link com.myfinance.backend.model.Transaction} by
 * {@link com.myfinance.backend.mapper.TransactionMapper}.
 */
public record TransactionResponse(
        Long id,
        CategoryRef category,
        @Schema(type = "string", format = "decimal", example = "243.5000") BigDecimal amount,
        String currency,
        TransactionType type,
        LocalDate occurredOn,
        String description,
        String merchant,
        Long subscriptionId,
        OffsetDateTime createdAt
) {
}
