package com.myfinance.backend.dto;

import java.math.BigDecimal;

/** One per-currency total on the subscription dashboard — totals are never mixed across currencies. */
public record CurrencyAmount(String currency, BigDecimal amount) {}
