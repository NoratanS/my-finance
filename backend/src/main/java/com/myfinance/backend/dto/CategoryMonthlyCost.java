package com.myfinance.backend.dto;

import java.math.BigDecimal;

/** One row of the dashboard's by-category breakdown: active subscriptions grouped by category and currency. */
public record CategoryMonthlyCost(CategoryRef category, String currency, BigDecimal monthlyAmount) {}
