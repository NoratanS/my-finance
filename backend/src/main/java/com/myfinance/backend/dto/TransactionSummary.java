package com.myfinance.backend.dto;

import java.math.BigDecimal;

import com.myfinance.backend.model.Money;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * One row of {@code GET /api/transactions/summary}: the income, expense and net of every matching
 * transaction in a single currency (docs/API.md "GET /api/transactions/summary").
 * <p>
 * One row per currency, never a mixed total — there is no FX layer in this app.
 */
public record TransactionSummary(
        String currency,

        @Schema(type = "string", format = "decimal", example = "243.5000")
        BigDecimal income,

        @Schema(type = "string", format = "decimal", example = "243.5000")
        BigDecimal expense,

        @Schema(type = "string", format = "decimal", example = "243.5000")
        BigDecimal net,

        long count) {

    /** Normalizes both sides to scale 4 and derives {@code net}, so a missing side reads "0.0000". */
    public static TransactionSummary of(String currency, BigDecimal income, BigDecimal expense, long count) {
        BigDecimal in = Money.normalize(income);
        BigDecimal out = Money.normalize(expense);
        return new TransactionSummary(currency, in, out, in.subtract(out), count);
    }
}
