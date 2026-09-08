package com.myfinance.backend.dto;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;

/** One per-currency total on the subscription dashboard — totals are never mixed across currencies. */
public record CurrencyAmount(
        String currency,

        @Schema(type = "string", format = "decimal", example = "243.5000")
        BigDecimal amount) {}
