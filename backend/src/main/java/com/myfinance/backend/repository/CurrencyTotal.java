package com.myfinance.backend.repository;

import java.math.BigDecimal;

/** Projection for per-currency sums — totals are never mixed across currencies. */
public interface CurrencyTotal {

    String getCurrency();

    BigDecimal getTotal();
}
