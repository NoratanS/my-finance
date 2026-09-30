package com.myfinance.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.myfinance.backend.model.Budget;

/** The {@code budget} object embedded in {@link BudgetStatusResponse} — no timestamps. */
public record BudgetSummary(
        Long id,
        CategoryRef category,
        BigDecimal amountLimit,
        String currency,
        LocalDate periodStart,
        LocalDate periodEnd) {

    public static BudgetSummary from(Budget budget) {
        return new BudgetSummary(
                budget.getId(),
                CategoryRef.from(budget.getCategory()),
                budget.getAmountLimit(),
                budget.getCurrency(),
                budget.getPeriodStart(),
                budget.getPeriodEnd());
    }
}
