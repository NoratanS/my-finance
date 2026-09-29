package com.myfinance.backend.dto;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;

/** One row of the dashboard's by-category breakdown: active subscriptions grouped by category and currency. */
public record CategoryMonthlyCost(
        CategoryRef category,
        String currency,

        @Schema(type = "string", format = "decimal", example = "243.5000")
        BigDecimal monthlyAmount) {}
